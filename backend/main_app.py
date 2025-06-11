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
from .chatgpt_interface import Poster

load_dotenv(dotenv_path='../../.env')
API_KEY = os.getenv("OPENAI_API_KEY")
USE_DUMMY_POSTER = os.getenv("USE_DUMMY_POSTER", "False").lower() == "true"

PROJECT_ROOT = Path(__file__).resolve().parent.parent

SIM_PARAMS = {
    "n_agents": 21,
    "n_opinions": 1,
    "min_prob": 0.05,
    "alpha_filter": 0.1,
    "user_agents_initial_opinion": [[0.5]],
    "user_alpha": 0.5,
    "strategic_agents_initial_opinion_targets": [[0.5]],
    "strategic_theta": 0.5,
    "theta": 7,
    "time_between_posts": 4.0,
    "posts_per_cycle": 3,
    "init_updates": 0,
    "include_strategic_agents": False,
    "loop_sleep_time": 5.0
}

OPINION_AXES = [
    {
        'name': 'Pineapple on Pizza',
        'pro': 'Pineapple on pizza is the best possible pizza topping',
        'con': 'Pineapple on pizza is the worst possible pizza topping'
    }
]

BOT_NAMES = [
    "User",
    "Marshall", "Brigham", "Nephi", "Khalid", "Amari", "Joon-ho", "Rohan", "Mateo", "Diego", "Hector",
    "Lily", "Eliza", "Agnes", "Aaliyah", "Yasmine", "Yuki", "Leilani", "Carmen", "Mei", "Priya"
]

SIM_STATE = {
    "network_instance": None,
    "poster_instance": None,
    "simulation_task": None,
    "current_bot_names": np.array(BOT_NAMES[:SIM_PARAMS["n_agents"]]),
    "user_posted_this_cycle_flag": False,
    "simulation_running": False
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
    num_total_agents = SIM_PARAMS["n_agents"]
    
    active_bot_names = BOT_NAMES[:num_total_agents]

    final_bot_names = [""] * num_total_agents
    if num_total_agents > 0:
        final_bot_names[0] = "User"
        names_to_fill = [name for name in active_bot_names if name != "User"]
        
        fill_idx = 1
        for name in names_to_fill:
            if fill_idx < num_total_agents:
                final_bot_names[fill_idx] = name
                fill_idx += 1
            else:
                break
        
        for i in range(fill_idx, num_total_agents):
            final_bot_names[i] = f"Agent {i}"
    
    SIM_STATE["current_bot_names"] = np.array(final_bot_names)
    SIM_PARAMS["user_agents_initial_opinion"] = [[0.5]]

def initialize_network_and_poster():
    setup_simulation_parameters()

    init_opinion_one = beta.rvs(a=2, b=2, size=SIM_PARAMS["n_agents"])
    np.random.shuffle(init_opinion_one) 
    init_X = init_opinion_one.reshape(-1, 1)
    
    if SIM_PARAMS["user_agents_initial_opinion"] and SIM_PARAMS["n_agents"] > 0 and init_X.shape[0] > 0:
        init_X[0] = SIM_PARAMS["user_agents_initial_opinion"][0]

    SIM_STATE["network_instance"] = Network(
        n_agents=SIM_PARAMS["n_agents"],
        n_opinions=SIM_PARAMS["n_opinions"],
        X=init_X.copy(),
        min_prob=SIM_PARAMS["min_prob"],
        alpha_filter=SIM_PARAMS["alpha_filter"],
        user_agents=SIM_PARAMS["user_agents_initial_opinion"] if SIM_PARAMS["n_agents"] > 0 else [],
        user_alpha=SIM_PARAMS["user_alpha"],
        strategic_agents=SIM_PARAMS.get("strategic_agents_initial_opinion_targets", []),
        strategic_theta=SIM_PARAMS["strategic_theta"],
        theta=SIM_PARAMS["theta"]
    )
    SIM_STATE["poster_instance"] = Poster(API_KEY, OPINION_AXES, dummy_mode=USE_DUMMY_POSTER)
    
    if SIM_STATE["network_instance"]: 
        for _ in range(SIM_PARAMS["init_updates"]):
            SIM_STATE["network_instance"].update_network(include_user_opinions=False)

@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    initialize_network_and_poster()
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

    # All agents except User (index 0) are considered for scaling
    normal_agent_indices = list(range(1, n_agents))

    x_min, x_max = 0.0, 1.0

    if normal_agent_indices and X_opinions.ndim == 2 and X_opinions.shape[0] == n_agents and X_opinions.shape[1] >= 1:
        valid_normal_indices = [idx for idx in normal_agent_indices if idx < X_opinions.shape[0]]
        if not valid_normal_indices:
             return {"x_min": x_min, "x_max": x_max}

        normal_opinions_x = X_opinions[valid_normal_indices, 0]

        if normal_opinions_x.size > 0:
            x_min_val, x_max_val = float(normal_opinions_x.min()), float(normal_opinions_x.max())
            x_min = x_min_val if x_min_val < x_max_val else (x_min_val - 0.01 if x_min_val > 0 else 0.0)
            x_max = x_max_val if x_min_val < x_max_val else (x_max_val + 0.01 if x_max_val < 1 else 1.0)
            if x_min == x_max:
                x_min, x_max = 0.0, 1.0
                
    return {"x_min": x_min, "x_max": x_max}

def _create_simulation_state_payload(current_network_instance: Network, 
                                     sim_params_config: dict, 
                                     current_bot_names_list: List[str], 
                                     opinion_axes_list: List[Dict]) -> Dict:
    if current_network_instance is None:
        raise ValueError("Network instance is not initialized.")

    X, A, _, edge_weights = current_network_instance.get_state()
    color_params = _calculate_color_scaling_params(X, sim_params_config)
    
    return {
        "opinions": X.tolist() if X is not None else [],
        "adjacency_matrix": A.tolist() if A is not None else [],
        "edge_weights": edge_weights.tolist() if edge_weights is not None else [],
        "agent_names": current_bot_names_list,
        "opinion_axes": opinion_axes_list,
        "n_agents": sim_params_config.get("n_agents", 0),
        "user_agent_index": 0,
        "strategic_agent_count": 0,
        "include_strategic_agents": False,
        "color_scaling_params": color_params
    }

class UserMessage(BaseModel):
    message: str

class ResetConfig(BaseModel):
    include_strategic_agents: bool | None = None

class SimulationControl(BaseModel):
    action: str

@app.get("/api/initial_state")
async def get_initial_state_api():
    if SIM_STATE["network_instance"] is None:
        initialize_network_and_poster()
        if SIM_STATE["network_instance"] is None:
            raise HTTPException(status_code=500, detail="Simulation not initialized properly.")
    
    try:
        payload = _create_simulation_state_payload(
            SIM_STATE["network_instance"], 
            SIM_PARAMS, 
            SIM_STATE["current_bot_names"].tolist() if isinstance(SIM_STATE["current_bot_names"], np.ndarray) else list(SIM_STATE["current_bot_names"]), 
            OPINION_AXES
        )
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving simulation state: {str(e)}")

@app.post("/api/send_message")
async def send_user_message(user_message: UserMessage):
    if SIM_STATE["network_instance"] is None or SIM_STATE["poster_instance"] is None:
        raise HTTPException(status_code=500, detail="Simulation not initialized")

    message_text = user_message.message.strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    user_agent_index = 0

    try:
        user_opinion_vector = await asyncio.to_thread(SIM_STATE["poster_instance"].analyze_post, message_text)
    except Exception as e:
        user_opinion_vector = SIM_PARAMS["user_agents_initial_opinion"][0] 
        await manager.broadcast_json({
            "type": "system_message",
            "data": {"message": "Error analyzing your post, using default opinion."}
        })

    if isinstance(user_opinion_vector, list) and len(user_opinion_vector) == SIM_PARAMS["n_opinions"]:
        SIM_STATE["network_instance"].add_user_opinion(np.array(user_opinion_vector), user_index=user_agent_index)
    else:
        current_X_state, _, _ = SIM_STATE["network_instance"].get_state()
        if current_X_state.shape[0] > user_agent_index:
             SIM_STATE["network_instance"].add_user_opinion(np.array(current_X_state[user_agent_index]), user_index=user_agent_index)
        else:
             SIM_STATE["network_instance"].add_user_opinion(np.array(SIM_PARAMS["user_agents_initial_opinion"][0]), user_index=user_agent_index)

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

    SIM_STATE["user_posted_this_cycle_flag"] = True
    return {"status": "message_processed", "analyzed_opinion": user_opinion_vector}

@app.post("/api/reset_simulation")
async def reset_simulation_api(config: ResetConfig):
    if SIM_STATE["simulation_running"]:
        await control_simulation(SimulationControl(action="stop"))
    
    initialize_network_and_poster()

    if SIM_STATE["network_instance"] and SIM_STATE["poster_instance"]:
        try:
            full_state_payload = _create_simulation_state_payload(
                SIM_STATE["network_instance"], 
                SIM_PARAMS, 
                SIM_STATE["current_bot_names"].tolist() if isinstance(SIM_STATE["current_bot_names"], np.ndarray) else list(SIM_STATE["current_bot_names"]), 
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
        if not SIM_STATE["simulation_running"] and SIM_STATE["network_instance"] and SIM_STATE["poster_instance"]:
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
    if not SIM_STATE["network_instance"] or not SIM_STATE["poster_instance"]:
        return

    while SIM_STATE["simulation_running"]: 
        try:
            user_acted_this_cycle = SIM_STATE["user_posted_this_cycle_flag"]
            if user_acted_this_cycle:
                 SIM_STATE["user_posted_this_cycle_flag"] = False

            last_post_time_cycle = time.time()

            if SIM_STATE["poster_instance"] and SIM_STATE["network_instance"]:
                X_state, _, _, _ = SIM_STATE["network_instance"].get_state() 
                
                num_bots_to_post = SIM_PARAMS.get("posts_per_cycle", 1)
                agent_indices_all = list(range(SIM_PARAMS["n_agents"]))
                
                eligible_posters = [idx for idx in agent_indices_all if idx != 0]
                
                posting_bots_indices = []
                if eligible_posters:
                    posting_bots_indices = random.sample(eligible_posters, min(num_bots_to_post, len(eligible_posters)))
                
                if SIM_PARAMS.get("include_strategic_agents"):
                    num_strategic = len(SIM_PARAMS.get("strategic_agents_initial_opinion_targets",[]))
                    if num_strategic > 0:
                        strategic_indices = list(range(SIM_PARAMS["n_agents"] - num_strategic, SIM_PARAMS["n_agents"]))
                        if not any(idx in posting_bots_indices for idx in strategic_indices) and strategic_indices:
                            chosen_strategic = random.choice(strategic_indices)
                            if len(posting_bots_indices) < num_bots_to_post:
                                if chosen_strategic not in posting_bots_indices:
                                    posting_bots_indices.append(chosen_strategic)
                            elif posting_bots_indices:
                                non_strategic_in_list = [idx for idx in posting_bots_indices if idx not in strategic_indices]
                                if non_strategic_in_list:
                                    posting_bots_indices.remove(random.choice(non_strategic_in_list))
                                    if chosen_strategic not in posting_bots_indices:
                                        posting_bots_indices.append(chosen_strategic)
                
                random.shuffle(posting_bots_indices)

                for agent_idx in posting_bots_indices:
                    if not SIM_STATE["network_instance"] or not SIM_STATE["simulation_running"]: break 
                    agent_opinion = X_state[agent_idx]
                    agent_name = SIM_STATE["current_bot_names"][agent_idx] if agent_idx < len(SIM_STATE["current_bot_names"]) else f"Agent {agent_idx}"
                    
                    try:
                        post_delay = SIM_PARAMS.get("time_between_posts", 0.1)
                        if time.time() - last_post_time_cycle < post_delay:
                             await asyncio.sleep(max(0, post_delay - (time.time() - last_post_time_cycle)))
                        
                        post_content = await asyncio.to_thread(SIM_STATE["poster_instance"].generate_post, agent_name, agent_opinion)
                        
                        try:
                            analyzed_opinion = await asyncio.to_thread(SIM_STATE["poster_instance"].analyze_post, post_content)
                            if analyzed_opinion and len(analyzed_opinion) == SIM_PARAMS["n_opinions"]:
                                SIM_STATE["network_instance"].update_network(include_user_opinions=False)

                                X_updated, A_updated, _, edge_weights_updated = SIM_STATE["network_instance"].get_state()
                                current_color_params = _calculate_color_scaling_params(X_updated, SIM_PARAMS)
                                await manager.broadcast_json({
                                    "type": "opinion_update",
                                    "data": X_updated.tolist(),
                                    "adjacency_matrix": A_updated.tolist(),
                                    "edge_weights": edge_weights_updated.tolist(),
                                    "color_scaling_params": current_color_params
                                })
                        except Exception:
                            pass
                        
                        await manager.broadcast_json({
                            "type": "new_post",
                            "data": {
                                "sender_name": agent_name,
                                "sender_index": agent_idx,
                                "message": post_content,
                                "opinion_vector": agent_opinion.tolist()
                            }
                        })
                        last_post_time_cycle = time.time()
                    except Exception:
                        await manager.broadcast_json({
                            "type": "system_message",
                            "data": {"message": f"System: Error with {agent_name}'s post."}
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

            await asyncio.sleep(SIM_PARAMS.get("loop_sleep_time", 0.5)) 

        except asyncio.CancelledError:
            break
        except Exception:
            await asyncio.sleep(1) 

    SIM_STATE["simulation_running"] = False

app.mount("/static", StaticFiles(directory=PROJECT_ROOT / "frontend" / "static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse(PROJECT_ROOT / "frontend" / "index.html")

@app.get("/health")
async def health_check():
    return {"status": "ok"} 