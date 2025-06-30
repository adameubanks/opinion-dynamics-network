import os
import asyncio
import time
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import numpy as np
import random
from scipy.stats import beta
from typing import List, Dict

from .network_backend import Network
from .chatgpt_interface import OpinionAnalyzer
from .pre_generated_posts import get_post_for_opinion

load_dotenv()
API_KEY = os.getenv("OPENAI_API_KEY")

PROJECT_ROOT = Path(__file__).resolve().parent.parent

SIM_PARAMS = {
    "n_agents": 21,
    "alpha_filter": 0.9,
    "min_connections_per_agent": 2,
    "user_agents_initial_opinion": [[0.5]],
    "user_alpha": 0.95,
    "user_connections": 5,
    "loop_sleep_time": 5,
}

OPINION_AXES = [
    {
        'name': 'Pineapple on Pizza',
        'pro': 'Pineapple is a great topping that enhances the flavor of a pizza.',
        'con': 'Pineapple does not belong on pizza; it ruins the flavor.'
    }
]

SIM_STATE = {
    "network_instance": None,
    "opinion_analyzer_instance": None,
    "simulation_task": None,
    "user_posted_this_cycle_flag": False,
    "simulation_running": False,
    "user_has_posted": False,
    "speed_update_event": None,
}

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_json(self, data: dict):
        for connection in self.active_connections:
            await connection.send_json(data)

manager = ConnectionManager()

def setup_simulation_parameters():    
    SIM_PARAMS["user_agents_initial_opinion"] = [[0.5]]

def initialize_network_and_analyzer():
    setup_simulation_parameters()
    SIM_STATE["speed_update_event"] = asyncio.Event()

    init_opinion_one = beta.rvs(a=2, b=2, size=SIM_PARAMS["n_agents"])
    np.random.shuffle(init_opinion_one) 
    init_X = init_opinion_one.reshape(-1, 1)
    
    if SIM_PARAMS["user_agents_initial_opinion"] and SIM_PARAMS["n_agents"] > 0 and init_X.shape[0] > 0:
        init_X[0] = SIM_PARAMS["user_agents_initial_opinion"][0]

    SIM_STATE["network_instance"] = Network(
        n_agents=SIM_PARAMS["n_agents"],
        X=init_X.copy(),
        alpha_filter=SIM_PARAMS["alpha_filter"],
        user_agents=SIM_PARAMS["user_agents_initial_opinion"] if SIM_PARAMS["n_agents"] > 0 else [],
        user_alpha=SIM_PARAMS["user_alpha"],
        user_connections=SIM_PARAMS["user_connections"],
        min_connections=SIM_PARAMS["min_connections_per_agent"]
    )
    SIM_STATE["opinion_analyzer_instance"] = OpinionAnalyzer(API_KEY, OPINION_AXES)

@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    initialize_network_and_analyzer()
    yield
    if SIM_STATE["simulation_task"] is not None and not SIM_STATE["simulation_task"].done():
        SIM_STATE["simulation_task"].cancel()
        try:
            await SIM_STATE["simulation_task"]
        except asyncio.CancelledError:
            pass

app = FastAPI(lifespan=lifespan)

def _calculate_color_scaling_params(X_opinions: np.ndarray, sim_config: dict) -> Dict[str, float]:
    n_agents = sim_config.get("n_agents", 0)
    
    if n_agents <= 1 or X_opinions is None or X_opinions.size == 0:
        return {"x_min": 0.0, "x_max": 1.0}
    
    # Skip user agent (index 0), use all other agents
    normal_opinions_x = X_opinions[1:, 0]
    
    if normal_opinions_x.size == 0:
        return {"x_min": 0.0, "x_max": 1.0}
    
    x_min = float(normal_opinions_x.min())
    x_max = float(normal_opinions_x.max())
    
    return {"x_min": x_min, "x_max": x_max}

def _create_simulation_state_payload(current_network_instance: Network, sim_params_config: dict, opinion_axes_list: List[Dict]) -> Dict:
    X, A, _, edge_weights = current_network_instance.get_state()
    color_params = _calculate_color_scaling_params(X, sim_params_config)
    
    return {
        "opinions": X.tolist() if X is not None else [],
        "adjacency_matrix": A.tolist() if A is not None else [],
        "edge_weights": edge_weights.tolist() if edge_weights is not None else [],
        "opinion_axes": opinion_axes_list,
        "n_agents": sim_params_config.get("n_agents", 0),
        "user_agent_index": 0,
        "color_scaling_params": color_params
    }

class UserMessage(BaseModel):
    message: str


class SimulationControl(BaseModel):
    action: str

class SpeedControl(BaseModel):
    loop_sleep_time: float

@app.get("/api/initial_state")
async def get_initial_state_api():
    if SIM_STATE["network_instance"] is None:
        initialize_network_and_analyzer()
        if SIM_STATE["network_instance"] is None:
            raise HTTPException(status_code=500, detail="Simulation not initialized properly.")
    
    try:
        payload = _create_simulation_state_payload(
            SIM_STATE["network_instance"], 
            SIM_PARAMS, 
            OPINION_AXES
        )
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving simulation state: {str(e)}")

@app.post("/api/send_message")
async def send_user_message(user_message: UserMessage):
    if SIM_STATE["network_instance"] is None or SIM_STATE["opinion_analyzer_instance"] is None:
        raise HTTPException(status_code=500, detail="Simulation not initialized")

    message_text = user_message.message.strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    user_agent_index = 0
    SIM_STATE["user_has_posted"] = True

    try:
        user_opinion_vector = await asyncio.to_thread(SIM_STATE["opinion_analyzer_instance"].analyze_post, message_text)
    except Exception as e:
        user_opinion_vector = SIM_PARAMS["user_agents_initial_opinion"][0] 
        await manager.broadcast_json({
            "type": "system_message",
            "data": {"message": "Error analyzing your post, using default opinion."}
        })

    if isinstance(user_opinion_vector, list):
        SIM_STATE["network_instance"].add_user_opinion(np.array(user_opinion_vector), user_index=user_agent_index)
    else:
        current_X_state, _, _ = SIM_STATE["network_instance"].get_state()
        SIM_STATE["network_instance"].add_user_opinion(np.array(current_X_state[user_agent_index]), user_index=user_agent_index)

    if SIM_STATE["network_instance"] and user_opinion_vector:
        SIM_STATE["network_instance"].update_network(include_user_opinions=True)
        X_updated, A_updated, _, edge_weights_updated = SIM_STATE["network_instance"].get_state()
        current_color_params = _calculate_color_scaling_params(X_updated, SIM_PARAMS)
        await manager.broadcast_json({
            "type": "opinion_update",
            "data": X_updated.tolist(),
            "adjacency_matrix": A_updated.tolist(),
            "edge_weights": edge_weights_updated.tolist(),
            "color_scaling_params": current_color_params
        })

        await manager.broadcast_json({
            "type": "new_post",
            "data": {
                "sender_index": user_agent_index,
                "message": message_text,
                "opinion_vector": X_updated[user_agent_index].tolist(),
                "analyzed_opinion": user_opinion_vector if isinstance(user_opinion_vector, list) else X_updated[user_agent_index].tolist()
            }
        })

    SIM_STATE["user_posted_this_cycle_flag"] = True
    return {"status": "message_processed", "analyzed_opinion": user_opinion_vector}

@app.post("/api/reset_simulation")
async def reset_simulation_api():
    if SIM_STATE["simulation_running"]:
        await control_simulation(SimulationControl(action="stop"))
    
    SIM_STATE["user_has_posted"] = False
    initialize_network_and_analyzer()

    if SIM_STATE["network_instance"] and SIM_STATE["opinion_analyzer_instance"]:
        try:
            full_state_payload = _create_simulation_state_payload(
                SIM_STATE["network_instance"], 
                SIM_PARAMS, 
                OPINION_AXES
            )
            await manager.broadcast_json({
                "type": "reset_complete", 
                "data": full_state_payload 
            })
            return {"message": "Simulation reset successfully and new state broadcasted."}
        except Exception:
            return {"message": "Simulation reset but failed to broadcast new state fully."}
    else:
        raise HTTPException(status_code=500, detail="Failed to re-initialize simulation after reset.")

@app.post("/api/control_simulation")
async def control_simulation(control: SimulationControl):
    if control.action == "start":
        if not SIM_STATE["simulation_running"] and SIM_STATE["network_instance"] and SIM_STATE["opinion_analyzer_instance"]:
            SIM_STATE["simulation_running"] = True
            if SIM_STATE["simulation_task"] is None or SIM_STATE["simulation_task"].done():
                SIM_STATE["simulation_task"] = asyncio.create_task(simulation_loop_task())
            return {"status": "started", "message": "Simulation started"}
        else:
            return {"status": "already_running", "message": "Simulation is already running"}
    
    elif control.action == "stop":
        if SIM_STATE["simulation_running"]:
            SIM_STATE["simulation_running"] = False
            if SIM_STATE["simulation_task"] and not SIM_STATE["simulation_task"].done():
                SIM_STATE["simulation_task"].cancel()
                try:
                    await SIM_STATE["simulation_task"]
                except asyncio.CancelledError:
                    pass
                finally:
                    SIM_STATE["simulation_task"] = None
            return {"status": "stopped", "message": "Simulation stopped"}
        else:
            return {"status": "already_stopped", "message": "Simulation is already stopped"}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'start' or 'stop'")

@app.get("/api/simulation_status")
async def get_simulation_status():
    return {"running": SIM_STATE["simulation_running"]}

@app.websocket("/ws/simulation_updates")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text() 
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        manager.disconnect(websocket)

async def simulation_loop_task():
    if not SIM_STATE["network_instance"] or not SIM_STATE["opinion_analyzer_instance"]:
        return

    while SIM_STATE["simulation_running"]: 
        try:
            user_acted_this_cycle = SIM_STATE["user_posted_this_cycle_flag"]
            if user_acted_this_cycle:
                 SIM_STATE["user_posted_this_cycle_flag"] = False

            last_post_time_cycle = time.time()

            if SIM_STATE["opinion_analyzer_instance"] and SIM_STATE["network_instance"]:
                X_state, _, _, _ = SIM_STATE["network_instance"].get_state() 
                
                num_bots_to_post = 1
                agent_indices_all = list(range(SIM_PARAMS["n_agents"]))
                
                eligible_posters = [idx for idx in agent_indices_all if idx != 0]
                
                posting_bots_indices = []
                if eligible_posters:
                    posting_bots_indices = random.sample(eligible_posters, min(num_bots_to_post, len(eligible_posters)))
                
                random.shuffle(posting_bots_indices)

                for agent_idx in posting_bots_indices:
                    if not SIM_STATE["network_instance"] or not SIM_STATE["simulation_running"]: break 
                    agent_opinion = X_state[agent_idx]
                    
                    try:                        
                        post_data = get_post_for_opinion(agent_opinion[0])
                        post_content = post_data["text"]
                        analyzed_opinion = post_data["sentiment"]
                        if analyzed_opinion:
                            SIM_STATE["network_instance"].set_agent_opinion(agent_idx, np.array(analyzed_opinion))
                        
                        if SIM_STATE["network_instance"]:
                            SIM_STATE["network_instance"].update_network(include_user_opinions=SIM_STATE["user_has_posted"])
                        
                        X_updated, A_updated, _, edge_weights_updated = SIM_STATE["network_instance"].get_state()
                        current_color_params = _calculate_color_scaling_params(X_updated, SIM_PARAMS)
                        await manager.broadcast_json({
                            "type": "opinion_update",
                            "data": X_updated.tolist(),
                            "adjacency_matrix": A_updated.tolist(),
                            "edge_weights": edge_weights_updated.tolist(),
                            "color_scaling_params": current_color_params
                        })
                        
                        await manager.broadcast_json({
                            "type": "new_post",
                            "data": {
                                "sender_index": agent_idx,
                                "message": post_content,
                                "opinion_vector": agent_opinion.tolist(),
                                "analyzed_opinion": analyzed_opinion if isinstance(analyzed_opinion, list) else agent_opinion.tolist()
                            }
                        })
                    except Exception as e:
                        await manager.broadcast_json({
                            "type": "system_message",
                            "data": {"message": f"System: Error with post. {e}"}
                        })

            if SIM_STATE["network_instance"] and SIM_STATE["simulation_running"]:
                X_updated, A_updated, _, edge_weights_updated = SIM_STATE["network_instance"].get_state()
                current_color_params = _calculate_color_scaling_params(X_updated, SIM_PARAMS)
                
                await manager.broadcast_json({
                    "type": "opinion_update",
                    "data": X_updated.tolist(),
                    "adjacency_matrix": A_updated.tolist(),
                    "edge_weights": edge_weights_updated.tolist(),
                    "color_scaling_params": current_color_params 
                })

            sleep_duration = SIM_PARAMS.get("loop_sleep_time")
            speed_update_event = SIM_STATE.get("speed_update_event")

            if speed_update_event:
                sleep_task = asyncio.create_task(asyncio.sleep(sleep_duration))
                event_wait_task = asyncio.create_task(speed_update_event.wait())

                done, pending = await asyncio.wait(
                    {sleep_task, event_wait_task},
                    return_when=asyncio.FIRST_COMPLETED
                )

                if event_wait_task in done:
                    speed_update_event.clear()

                for task in pending:
                    task.cancel()
            else:
                await asyncio.sleep(sleep_duration)

        except asyncio.CancelledError:
            break
        except Exception:
            await asyncio.sleep(1) 

    SIM_STATE["simulation_running"] = False

@app.post("/api/update_speed")
async def update_speed(speed: SpeedControl):
    new_speed = speed.loop_sleep_time
    if 0.1 <= new_speed <= 10.0:
        SIM_PARAMS["loop_sleep_time"] = new_speed
        if SIM_STATE.get("speed_update_event"):
            SIM_STATE["speed_update_event"].set()
        return {"status": "success", "new_speed": new_speed}
    else:
        raise HTTPException(status_code=400, detail="Invalid speed value.")

app.mount("/static", StaticFiles(directory=PROJECT_ROOT / "frontend" / "static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse(PROJECT_ROOT / "frontend" / "index.html")

@app.get("/health")
async def health_check():
    return {"status": "ok"} 