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

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

SIM_PARAMS = {
    "seed": 40,
    "n_agents": 20,
    "n_opinions": 1,
    "theta": 5.0,
    "min_prob": 0.03,
    "alpha_filter": 1.0,
    "user_agents_initial_opinion": [[0.5]],
    "user_alpha": 0.5,
    "strategic_agents_initial_opinion_targets": [[0.5]],
    "strategic_theta": -1.5,
    "time_between_posts": 8.0,
    "updates_per_cycle": 5,
    "posts_per_cycle": 3,
    "init_updates": 0,
    "include_strategic_agents": True,
    "loop_sleep_time": 5.0
}

OPINION_AXES = [
    {
        'name': 'Pineapple on Pizza',
        'pro': 'Pineapple on pizza is the best possible pizza topping',
        'con': 'Pineapple on pizza is the worst possible pizza topping'
    }
]

BOT_NAMES_BASE = np.array([
    "User", "Margaret", "Betty", "Janice", "Diane", "Gloria", "Mildred", "Agnes", "Marjorie", "Carol",
    "Helen", "Dorothy", "Beatrice", "Shirley", "Phyllis", "Irene", "Eleanor", "Norma"
])
BOT_NAMES_STRATEGIC_DEFAULT = ["Vladi-meow", "Pineapple Dmit-za"]
BOT_NAMES_NON_STRATEGIC_REPLACEMENTS = ["Anita", "Orva"]

network_instance: Network | None = None
poster_instance: Poster | None = None
simulation_task: asyncio.Task | None = None
current_bot_names = BOT_NAMES_BASE[:SIM_PARAMS["n_agents"]].copy()
user_posted_this_cycle_flag = False
simulation_running = False

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
        disconnected_sockets = []
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception:
                disconnected_sockets.append(connection)
        for ws in disconnected_sockets:
            self.disconnect(ws)

manager = ConnectionManager()

def setup_simulation_parameters(include_strategic: bool):
    global SIM_PARAMS, current_bot_names 
    
    SIM_PARAMS["include_strategic_agents"] = include_strategic
    num_total_agents = SIM_PARAMS["n_agents"] 

    if include_strategic:
        SIM_PARAMS["strategic_agents_initial_opinion_targets"] = [[0.0], [1.0]]
        num_strategic_agents = len(SIM_PARAMS["strategic_agents_initial_opinion_targets"])
        num_base_names_needed = num_total_agents - num_strategic_agents
        active_bot_names = list(BOT_NAMES_BASE[:num_base_names_needed]) + BOT_NAMES_STRATEGIC_DEFAULT[:num_strategic_agents]
    else:
        SIM_PARAMS["strategic_agents_initial_opinion_targets"] = []
        num_non_strategic_replacements = len(BOT_NAMES_NON_STRATEGIC_REPLACEMENTS)
        if num_total_agents >= num_non_strategic_replacements:
            num_base_names_needed = num_total_agents - num_non_strategic_replacements
            active_bot_names = list(BOT_NAMES_BASE[:num_base_names_needed]) + BOT_NAMES_NON_STRATEGIC_REPLACEMENTS
        else:
            active_bot_names = list(BOT_NAMES_BASE[:num_total_agents])

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
    
    current_bot_names = np.array(final_bot_names)
    SIM_PARAMS["user_agents_initial_opinion"] = [[0.5]]

def initialize_network_and_poster():
    global network_instance, poster_instance, SIM_PARAMS, OPINION_AXES, current_bot_names, USE_DUMMY_POSTER

    setup_simulation_parameters(SIM_PARAMS.get("include_strategic_agents", True))

    np.random.seed(SIM_PARAMS["seed"])
    random.seed(SIM_PARAMS["seed"])

    init_opinion_one = beta.rvs(a=2, b=2, size=SIM_PARAMS["n_agents"], random_state=SIM_PARAMS["seed"])
    np.random.shuffle(init_opinion_one) 
    init_X = init_opinion_one.reshape(-1, 1)
    
    if SIM_PARAMS["user_agents_initial_opinion"] and SIM_PARAMS["n_agents"] > 0 and init_X.shape[0] > 0:
        init_X[0] = SIM_PARAMS["user_agents_initial_opinion"][0]

    network_instance = Network(
        n_agents=SIM_PARAMS["n_agents"],
        n_opinions=SIM_PARAMS["n_opinions"],
        X=init_X.copy(),
        theta=SIM_PARAMS["theta"],
        min_prob=SIM_PARAMS["min_prob"],
        alpha_filter=SIM_PARAMS["alpha_filter"],
        user_agents=SIM_PARAMS["user_agents_initial_opinion"] if SIM_PARAMS["n_agents"] > 0 else [],
        user_alpha=SIM_PARAMS["user_alpha"],
        strategic_agents=SIM_PARAMS.get("strategic_agents_initial_opinion_targets", []),
        strategic_theta=SIM_PARAMS["strategic_theta"]
    )
    poster_instance = Poster(API_KEY, OPINION_AXES, dummy_mode=USE_DUMMY_POSTER)
    
    if network_instance: 
        for _ in range(SIM_PARAMS["init_updates"]):
            network_instance.update_network(include_user_opinions=False)

@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    global simulation_task, network_instance, poster_instance
    initialize_network_and_poster()
    
    yield
    
    if simulation_task is not None and not simulation_task.done():
        simulation_task.cancel()
        try:
            await simulation_task
        except asyncio.CancelledError:
            pass

app = FastAPI(lifespan=lifespan)

def _calculate_color_scaling_params(X_opinions: np.ndarray, sim_config: dict) -> Dict[str, float]:
    num_strategic = len(sim_config.get("strategic_agents_initial_opinion_targets", [])) if sim_config.get("include_strategic_agents") else 0
    n_agents = sim_config.get("n_agents", 0)

    normal_agent_indices = list(range(1, n_agents - num_strategic))

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

    X, A, _ = current_network_instance.get_state()
    color_params = _calculate_color_scaling_params(X, sim_params_config)
    
    num_strategic_agents = 0
    if sim_params_config.get("include_strategic_agents", False):
        num_strategic_agents = len(sim_params_config.get("strategic_agents_initial_opinion_targets", []))

    return {
        "opinions": X.tolist() if X is not None else [],
        "adjacency_matrix": A.tolist() if A is not None else [],
        "agent_names": current_bot_names_list,
        "opinion_axes": opinion_axes_list,
        "n_agents": sim_params_config.get("n_agents", 0),
        "user_agent_index": 0,
        "strategic_agent_count": num_strategic_agents,
        "include_strategic_agents": sim_params_config.get("include_strategic_agents", True),
        "color_scaling_params": color_params
    }

class UserMessage(BaseModel):
    message: str

class ResetConfig(BaseModel):
    include_strategic_agents: bool | None = None
    seed: int | None = None

class SimulationControl(BaseModel):
    action: str

@app.get("/api/initial_state")
async def get_initial_state_api():
    global network_instance, SIM_PARAMS, current_bot_names, OPINION_AXES
    if network_instance is None:
        initialize_network_and_poster()
        if network_instance is None:
            raise HTTPException(status_code=500, detail="Simulation not initialized properly.")
    
    try:
        payload = _create_simulation_state_payload(
            network_instance, 
            SIM_PARAMS, 
            current_bot_names.tolist() if isinstance(current_bot_names, np.ndarray) else list(current_bot_names), 
            OPINION_AXES
        )
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving simulation state: {str(e)}")

async def send_staggered_agent_responses(user_agent_index: int, current_A: np.ndarray, current_bot_names: np.ndarray):
    agent_indices = [i for i in range(SIM_PARAMS["n_agents"]) if i != user_agent_index]
    random.shuffle(agent_indices)
    
    for i, agent_idx in enumerate(agent_indices):
        is_strategic = False
        if SIM_PARAMS["include_strategic_agents"]:
            num_strat = len(SIM_PARAMS.get("strategic_agents_initial_opinion_targets", []))
            if agent_idx >= SIM_PARAMS["n_agents"] - num_strat:
                is_strategic = True
        
        agent_name = current_bot_names[agent_idx] if agent_idx < len(current_bot_names) else f"Agent {agent_idx}"
        
        if current_A[user_agent_index, agent_idx] == 1 or is_strategic:
            update_message = f"{agent_name} read your post."
        else:
            update_message = f"{agent_name} ignored your post."
        
        base_delay = 0.2 + (i * 0.05)
        random_variance = random.uniform(-0.1, 0.3)
        delay = max(0.1, base_delay + random_variance)
        
        await asyncio.sleep(delay)

@app.post("/api/send_message")
async def send_user_message(user_message: UserMessage):
    global user_posted_this_cycle_flag
    if network_instance is None or poster_instance is None:
        raise HTTPException(status_code=500, detail="Simulation not initialized")

    message_text = user_message.message.strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    user_agent_index = 0

    try:
        user_opinion_vector = await asyncio.to_thread(poster_instance.analyze_post, message_text)
    except Exception as e:
        user_opinion_vector = SIM_PARAMS["user_agents_initial_opinion"][0] 
        await manager.broadcast_json({
            "type": "system_message",
            "data": {"message": "Error analyzing your post, using default opinion."}
        })

    if isinstance(user_opinion_vector, list) and len(user_opinion_vector) == SIM_PARAMS["n_opinions"]:
        network_instance.add_user_opinion(np.array(user_opinion_vector), user_index=user_agent_index)
    else:
        current_X_state, _, _ = network_instance.get_state()
        if current_X_state.shape[0] > user_agent_index:
             network_instance.add_user_opinion(np.array(current_X_state[user_agent_index]), user_index=user_agent_index)
        else:
             network_instance.add_user_opinion(np.array(SIM_PARAMS["user_agents_initial_opinion"][0]), user_index=user_agent_index)

    _, current_A, _ = network_instance.get_state()
    
    asyncio.create_task(send_staggered_agent_responses(user_agent_index, current_A, current_bot_names))
    
    user_posted_this_cycle_flag = True
    return {"status": "message_processed", "analyzed_opinion": user_opinion_vector}

@app.post("/api/reset_simulation")
async def reset_simulation_api(config: ResetConfig):
    global simulation_task, network_instance, poster_instance, SIM_PARAMS, current_bot_names, OPINION_AXES, user_posted_this_cycle_flag, simulation_running
    
    if simulation_task and not simulation_task.done():
        simulation_task.cancel()
        try:
            await simulation_task
        except asyncio.CancelledError:
            pass
        finally:
            simulation_task = None 

    simulation_running = False

    if config.include_strategic_agents is not None:
        SIM_PARAMS["include_strategic_agents"] = config.include_strategic_agents
    if config.seed is not None: 
        SIM_PARAMS["seed"] = config.seed

    initialize_network_and_poster() 
    user_posted_this_cycle_flag = False

    if network_instance and poster_instance:
        try:
            full_state_payload = _create_simulation_state_payload(
                network_instance, 
                SIM_PARAMS, 
                current_bot_names.tolist() if isinstance(current_bot_names, np.ndarray) else list(current_bot_names), 
                OPINION_AXES
            )
            await manager.broadcast_json({
                "type": "reset_complete", 
                "data": full_state_payload 
            })
            return {"message": "Simulation reset successfully and new state broadcasted."}
        except Exception as e:
            return {"message": "Simulation reset but failed to broadcast new state fully."}
    else:
        raise HTTPException(status_code=500, detail="Failed to re-initialize simulation after reset.")

@app.post("/api/control_simulation")
async def control_simulation(control: SimulationControl):
    global simulation_task, simulation_running, network_instance, poster_instance
    
    if control.action == "start":
        if not simulation_running and network_instance and poster_instance:
            simulation_running = True
            if simulation_task is None or simulation_task.done():
                simulation_task = asyncio.create_task(simulation_loop_task())
            return {"status": "started", "message": "Simulation started"}
        else:
            return {"status": "already_running", "message": "Simulation is already running"}
    
    elif control.action == "stop":
        if simulation_running:
            simulation_running = False
            if simulation_task and not simulation_task.done():
                simulation_task.cancel()
                try:
                    await simulation_task
                except asyncio.CancelledError:
                    pass
                finally:
                    simulation_task = None
            return {"status": "stopped", "message": "Simulation stopped"}
        else:
            return {"status": "already_stopped", "message": "Simulation is already stopped"}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use 'start' or 'stop'")

@app.get("/api/simulation_status")
async def get_simulation_status():
    global simulation_running
    return {"running": simulation_running}

@app.websocket("/ws/simulation_updates")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text() 
    except WebSocketDisconnect:
        pass
    except Exception as e:
        pass
    finally:
        manager.disconnect(websocket)

async def simulation_loop_task():
    global network_instance, poster_instance, SIM_PARAMS, current_bot_names, manager, user_posted_this_cycle_flag, simulation_running
    
    if not network_instance or not poster_instance:
        return

    while simulation_running: 
        try:
            user_acted_this_cycle = user_posted_this_cycle_flag
            if user_acted_this_cycle:
                 user_posted_this_cycle_flag = False

            current_time = time.time()
            last_post_time_cycle = current_time 

            if poster_instance and network_instance:
                X_state, A_state, _ = network_instance.get_state() 
                
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
                    if not network_instance or not simulation_running: break 
                    agent_opinion = X_state[agent_idx]
                    agent_name = current_bot_names[agent_idx] if agent_idx < len(current_bot_names) else f"Agent {agent_idx}"
                    
                    is_strategic_agent = False
                    if SIM_PARAMS.get("include_strategic_agents"):
                        num_strat_conf = len(SIM_PARAMS.get("strategic_agents_initial_opinion_targets",[]))
                        if agent_idx >= (SIM_PARAMS["n_agents"] - num_strat_conf):
                            is_strategic_agent = True
                    
                    try:
                        post_delay = SIM_PARAMS.get("time_between_posts", 0.1)
                        if time.time() - last_post_time_cycle < post_delay:
                             await asyncio.sleep(max(0, post_delay - (time.time() - last_post_time_cycle)))
                        
                        post_content = await asyncio.to_thread(poster_instance.generate_post, agent_name, agent_opinion, is_agent=is_strategic_agent)
                        
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
                    except Exception as e:
                        await manager.broadcast_json({
                            "type": "system_message",
                            "data": {"message": f"System: Error with {agent_name}'s post."}
                        })

            if network_instance and simulation_running:
                for i in range(SIM_PARAMS.get("updates_per_cycle", 1)):
                    if not network_instance or not simulation_running: break 
                    network_instance.update_network(include_user_opinions=user_acted_this_cycle if i == 0 else False)

            if network_instance and simulation_running:
                X_updated, A_updated, _ = network_instance.get_state()
                current_color_params = _calculate_color_scaling_params(X_updated, SIM_PARAMS)
                
                await manager.broadcast_json({
                    "type": "opinion_update",
                    "data": X_updated.tolist(),
                    "adjacency_matrix": A_updated.tolist(), 
                    "color_scaling_params": current_color_params 
                })

            await asyncio.sleep(SIM_PARAMS.get("loop_sleep_time", 0.5)) 

        except asyncio.CancelledError:
            break
        except Exception as e:
            await asyncio.sleep(1) 

    simulation_running = False

app.mount("/static", StaticFiles(directory=PROJECT_ROOT / "frontend" / "static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse(PROJECT_ROOT / "frontend" / "index.html")

@app.get("/health")
async def health_check():
    return {"status": "ok"} 