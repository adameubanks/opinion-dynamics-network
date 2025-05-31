import os
import asyncio
import time # Added for simulation loop timing
from contextlib import asynccontextmanager # Added for lifespan management
from pathlib import Path # Added for absolute path resolution
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel # For request body validation
from dotenv import load_dotenv
import numpy as np
import random
from scipy.stats import beta # For initializing opinions
from typing import List, Dict # Added for type hinting

# --- Backend specific imports ---
from .network_backend import Network #, get_d_norm # get_d_norm not directly used in main_app
from .chatgpt_interface import Poster

# --- Global Configuration & Parameters ---
load_dotenv(dotenv_path='../../.env') # Assuming .env is in the project root
API_KEY = os.getenv("OPENAI_API_KEY")
# Environment variable to toggle dummy mode for Poster
USE_DUMMY_POSTER = os.getenv("USE_DUMMY_POSTER", "False").lower() == "true"

# --- Path Configuration (Added for robust file access) ---
BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

# Simulation parameters (migrated and adapted from original main.py)
# These can be overridden by client request during reset
SIM_PARAMS = {
    "seed": 40,
    "n_agents": 20,
    "n_opinions": 2,
    "theta": 5.0, # Network parameter
    "min_prob": 0.03, # Network parameter
    "alpha_filter": 1.0, # Network parameter
    "user_agents_initial_opinion": [[0.5, 0.5]], # Initial opinion for user agent(s)
    "user_alpha": 0.5, # Network parameter for user agent influence
    "strategic_agents_initial_opinion_targets": [], # Filled by setup_simulation_parameters
    "strategic_theta": -1.5, # Network parameter for strategic agent behavior
    "time_between_posts": 0.1, # Reduced for faster dummy posts
    "updates_per_cycle": 5, # Can be tuned
    "posts_per_cycle": 3, # Can be tuned
    "init_updates": 0, # Initial network updates before simulation starts
    "include_strategic_agents": True, # Default, can be changed via API
    "loop_sleep_time": 0.5 # Added for simulation loop
}

# Opinion axes and bot names (migrated from original main.py)
OPINION_AXES = [
    {
        'name': 'Pineapple on Pizza',
        'pro': 'Pineapple on pizza is the best possible pizza topping',
        'con': 'Pineapple on pizza is the worst possible pizza topping'
    },
    {
        'name': 'Cats',
        'pro': 'Cats are the best possible pet',
        'con': 'Cats are the worst possible pet'
    }
]

BOT_NAMES_BASE = np.array([
    "User", "Margaret", "Betty", "Janice", "Diane", "Gloria", "Mildred", "Agnes", "Marjorie", "Carol",
    "Helen", "Dorothy", "Beatrice", "Shirley", "Phyllis", "Irene", "Eleanor", "Norma"
    # Strategic names will be appended if active
])
BOT_NAMES_STRATEGIC_DEFAULT = ["Vladi-meow", "Pineapple Dmit-za"]
BOT_NAMES_NON_STRATEGIC_REPLACEMENTS = ["Anita", "Orva"] # Used if strategic agents are off

# Global instances - initialized in setup_simulation_parameters and on_event("startup")
network_instance: Network | None = None
poster_instance: Poster | None = None
simulation_task: asyncio.Task | None = None
current_bot_names = BOT_NAMES_BASE[:SIM_PARAMS["n_agents"]].copy() # Ensure correct length initially
user_posted_this_cycle_flag = False # Global flag for the simulation loop


# --- WebSocket Connection Management --- (Moved before lifespan)
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
            except Exception: # Catches disconnects or other errors
                disconnected_sockets.append(connection)
        for ws in disconnected_sockets:
            self.disconnect(ws)

manager = ConnectionManager()

# --- Simulation Initialization Helper Functions ---
def setup_simulation_parameters(include_strategic: bool):
    """Sets up SIM_PARAMS and BOT_NAMES based on strategic agent choice."""
    global SIM_PARAMS, current_bot_names 
    
    SIM_PARAMS["include_strategic_agents"] = include_strategic
    num_total_agents = SIM_PARAMS["n_agents"] 

    active_bot_names = []

    if include_strategic:
        SIM_PARAMS["strategic_agents_initial_opinion_targets"] = [[0.0, 1.0], [1.0, 0.5]]
        num_strategic_agents = len(SIM_PARAMS["strategic_agents_initial_opinion_targets"])
        
        # SIM_PARAMS["updates_per_cycle"] = 3 # These are already in SIM_PARAMS default
        # SIM_PARAMS["time_between_posts"] = 0.5 
        # SIM_PARAMS["posts_per_cycle"] = 2
        
        num_base_names_needed = num_total_agents - num_strategic_agents
        active_bot_names.extend(list(BOT_NAMES_BASE[:num_base_names_needed]))
        active_bot_names.extend(BOT_NAMES_STRATEGIC_DEFAULT[:num_strategic_agents])
    else:
        SIM_PARAMS["strategic_agents_initial_opinion_targets"] = []
        # SIM_PARAMS["updates_per_cycle"] = 3
        # SIM_PARAMS["time_between_posts"] = 0.0
        # SIM_PARAMS["posts_per_cycle"] = 2
        
        num_non_strategic_replacements = len(BOT_NAMES_NON_STRATEGIC_REPLACEMENTS)
        if num_total_agents >= num_non_strategic_replacements:
            num_base_names_needed = num_total_agents - num_non_strategic_replacements
            active_bot_names.extend(list(BOT_NAMES_BASE[:num_base_names_needed]))
            active_bot_names.extend(BOT_NAMES_NON_STRATEGIC_REPLACEMENTS)
        else: # Not enough total agents for all replacements, just use base names
            active_bot_names.extend(list(BOT_NAMES_BASE[:num_total_agents]))

    # Final adjustment to current_bot_names list to match num_total_agents
    final_bot_names = [""] * num_total_agents
    
    # Ensure "User" is at index 0
    if num_total_agents > 0:
        final_bot_names[0] = "User"
        # Fill remaining spots
        names_to_fill = active_bot_names
        # Remove "User" from names_to_fill if present, to avoid duplication and preserve order
        if "User" in names_to_fill:
            names_to_fill = [name for name in names_to_fill if name != "User"]
        
        fill_idx = 1
        for name in names_to_fill:
            if fill_idx < num_total_agents:
                final_bot_names[fill_idx] = name
                fill_idx += 1
            else:
                break # Filled all available agent slots
        
        # If there are still slots left (e.g. active_bot_names was too short), fill with generic names
        for i in range(fill_idx, num_total_agents):
            final_bot_names[i] = f"Agent {i}"
    
    current_bot_names = np.array(final_bot_names)
    SIM_PARAMS["user_agents_initial_opinion"] = [[0.5, 0.5]]


def initialize_network_and_poster():
    """Initializes or re-initializes the simulation network and poster."""
    global network_instance, poster_instance, SIM_PARAMS, OPINION_AXES, current_bot_names, USE_DUMMY_POSTER

    setup_simulation_parameters(SIM_PARAMS.get("include_strategic_agents", True))

    np.random.seed(SIM_PARAMS["seed"])
    random.seed(SIM_PARAMS["seed"])

    init_opinion_one = beta.rvs(a=2, b=2, size=SIM_PARAMS["n_agents"], random_state=SIM_PARAMS["seed"])
    init_opinion_two = beta.rvs(a=14, b=7, size=SIM_PARAMS["n_agents"], random_state=SIM_PARAMS["seed"])
    np.random.shuffle(init_opinion_one) 
    np.random.shuffle(init_opinion_two)
    init_X = np.column_stack((init_opinion_one, init_opinion_two))
    
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

    print(f"Network and Poster initialized/re-initialized. Strategic: {SIM_PARAMS.get('include_strategic_agents')}, Dummy Poster: {USE_DUMMY_POSTER}")
    if network_instance: 
        X_init, A_init, _ = network_instance.get_state()
        print(f"Initial X (mean): {np.mean(X_init, axis=0) if X_init.size > 0 else 'N/A'}")

# --- Lifespan Event Handler ---
@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    # Startup logic
    global simulation_task, network_instance, poster_instance # Ensure these are the globals we intend to modify
    print(f"FastAPI application starting up (lifespan). Dummy Poster: {USE_DUMMY_POSTER}")
    initialize_network_and_poster() # Initialize simulation components
    if network_instance and poster_instance:
        simulation_task = asyncio.create_task(simulation_loop_task())
        print("Simulation loop task created and started (lifespan).")
    else:
        print("Error: Failed to initialize network/poster. Simulation loop not started (lifespan).")
    
    yield # Application runs after this point
    
    # Shutdown logic
    print("FastAPI application shutting down (lifespan)...")
    if simulation_task is not None and not simulation_task.done():
        simulation_task.cancel()
        try:
            await simulation_task
        except asyncio.CancelledError:
            print("Simulation task cancelled on shutdown (lifespan).")
    print("Shutdown complete (lifespan).")

# --- FastAPI App Initialization ---
app = FastAPI(lifespan=lifespan) # Register lifespan handler

# --- Helper Functions for State Creation ---
def _calculate_color_scaling_params(X_opinions: np.ndarray, sim_config: dict) -> Dict[str, float]:
    """
    Calculates dynamic color scaling parameters (x_min, x_max, y_min, y_max)
    based on the opinions of normal agents.
    """
    num_strategic = len(sim_config.get("strategic_agents_initial_opinion_targets", [])) if sim_config.get("include_strategic_agents") else 0
    n_agents = sim_config.get("n_agents", 0)

    # Indices for normal agents (excluding user at index 0 and strategic agents at the end)
    # Normal agents range from index 1 up to n_agents - num_strategic - 1
    normal_agent_indices = list(range(1, n_agents - num_strategic))

    x_min, x_max, y_min, y_max = 0.0, 1.0, 0.0, 1.0  # Default full range

    if normal_agent_indices and X_opinions.ndim == 2 and X_opinions.shape[0] == n_agents and X_opinions.shape[1] >= 2:
        # Ensure indices are within bounds and array is valid
        valid_normal_indices = [idx for idx in normal_agent_indices if idx < X_opinions.shape[0]]
        if not valid_normal_indices: # No valid normal agents to compute scaling from
             return {"x_min": x_min, "x_max": x_max, "y_min": y_min, "y_max": y_max}

        normal_opinions_x = X_opinions[valid_normal_indices, 0]
        normal_opinions_y = X_opinions[valid_normal_indices, 1]

        if normal_opinions_x.size > 0:
            x_min_val, x_max_val = float(normal_opinions_x.min()), float(normal_opinions_x.max())
            # Ensure min is not equal to max for scaling, if so, use defaults or slightly expanded range
            x_min = x_min_val if x_min_val < x_max_val else (x_min_val - 0.01 if x_min_val > 0 else 0.0)
            x_max = x_max_val if x_min_val < x_max_val else (x_max_val + 0.01 if x_max_val < 1 else 1.0)
            if x_min == x_max: # Still equal, fallback to full range for this axis
                x_min, x_max = 0.0, 1.0


        if normal_opinions_y.size > 0:
            y_min_val, y_max_val = float(normal_opinions_y.min()), float(normal_opinions_y.max())
            y_min = y_min_val if y_min_val < y_max_val else (y_min_val - 0.01 if y_min_val > 0 else 0.0)
            y_max = y_max_val if y_min_val < y_max_val else (y_max_val + 0.01 if y_max_val < 1 else 1.0)
            if y_min == y_max: # Still equal, fallback to full range for this axis
                y_min, y_max = 0.0, 1.0
                
    return {"x_min": x_min, "x_max": x_max, "y_min": y_min, "y_max": y_max}

def _create_simulation_state_payload(current_network_instance: Network, 
                                     sim_params_config: dict, 
                                     current_bot_names_list: List[str], 
                                     opinion_axes_list: List[Dict]) -> Dict:
    """
    Constructs the complete simulation state payload for the frontend.
    """
    if current_network_instance is None:
        raise ValueError("Network instance is not initialized.")

    X, A, _ = current_network_instance.get_state()
    color_params = _calculate_color_scaling_params(X, sim_params_config)
    
    num_strategic_agents = 0
    if sim_params_config.get("include_strategic_agents", False):
        num_strategic_agents = len(sim_params_config.get("strategic_agents_initial_opinion_targets", []))

    payload = {
        "opinions": X.tolist() if X is not None else [],
        "adjacency_matrix": A.tolist() if A is not None else [],
        "agent_names": current_bot_names_list,
        "opinion_axes": opinion_axes_list,
        "n_agents": sim_params_config.get("n_agents", 0),
        "user_agent_index": 0,  # By convention
        "strategic_agent_count": num_strategic_agents,
        "include_strategic_agents": sim_params_config.get("include_strategic_agents", True),
        "color_scaling_params": color_params
    }
    return payload

# --- Pydantic Models for API Request Bodies ---
class UserMessage(BaseModel):
    message: str

class ResetConfig(BaseModel):
    include_strategic_agents: bool | None = None # Optional now
    seed: int | None = None

# --- API Endpoints ---
@app.get("/api/initial_state")
async def get_initial_state_api():
    global network_instance, SIM_PARAMS, current_bot_names, OPINION_AXES # Ensure globals are accessible
    if network_instance is None:
        print("Warning: network_instance is None in get_initial_state_api. Attempting to initialize.")
        initialize_network_and_poster() # This call should now work
        if network_instance is None:
            print("Error: Failed to initialize network_instance even after attempt in get_initial_state_api.")
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
        print(f"Error creating simulation state payload in get_initial_state_api: {e}")
        raise HTTPException(status_code=500, detail=f"Error retrieving simulation state: {str(e)}")

@app.post("/api/send_message")
async def send_user_message(user_message: UserMessage):
    global user_posted_this_cycle_flag # Ensure this global is recognized
    if network_instance is None or poster_instance is None:
        raise HTTPException(status_code=500, detail="Simulation not initialized")

    message_text = user_message.message.strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    user_agent_index = 0 # By convention

    try:
        user_opinion_vector = await asyncio.to_thread(poster_instance.analyze_post, message_text)
    except Exception as e:
        print(f"Error analyzing user post: {e}")
        user_opinion_vector = SIM_PARAMS["user_agents_initial_opinion"][0] 
        await manager.broadcast_json({
            "type": "system_message",
            "data": {"message": "Error analyzing your post, using default opinion."}
        })

    if isinstance(user_opinion_vector, list) and len(user_opinion_vector) == SIM_PARAMS["n_opinions"]:
        network_instance.add_user_opinion(np.array(user_opinion_vector), user_index=user_agent_index)
    else:
        print(f"Warning: Analyzed user opinion vector is not valid: {user_opinion_vector}.")
        # Fallback: use current user opinion from network or default
        current_X_state, _, _ = network_instance.get_state()
        if current_X_state.shape[0] > user_agent_index:
             network_instance.add_user_opinion(np.array(current_X_state[user_agent_index]), user_index=user_agent_index)
        else: # Should not happen if network is initialized
             network_instance.add_user_opinion(np.array(SIM_PARAMS["user_agents_initial_opinion"][0]), user_index=user_agent_index)


    await manager.broadcast_json({
        "type": "new_post",
        "data": {
            "sender_name": current_bot_names[user_agent_index] if user_agent_index < len(current_bot_names) else "User",
            "sender_index": user_agent_index,
            "message": message_text,
            "opinion_vector": user_opinion_vector 
        }
    })

    _, current_A, _ = network_instance.get_state()
    updates_log = []
    for i in range(SIM_PARAMS["n_agents"]):
        if i == user_agent_index:
            continue
        
        is_strategic = False
        if SIM_PARAMS["include_strategic_agents"]:
             num_strat = len(SIM_PARAMS.get("strategic_agents_initial_opinion_targets", []))
             if i >= SIM_PARAMS["n_agents"] - num_strat:
                 is_strategic = True
        
        agent_name_i = current_bot_names[i] if i < len(current_bot_names) else f"Agent {i}"
        if current_A[user_agent_index, i] == 1 or is_strategic:
            updates_log.append(f"{agent_name_i} read your post.")
        else:
            updates_log.append(f"{agent_name_i} ignored your post.")
            
    await manager.broadcast_json({"type": "updates_log", "data": updates_log})
    
    user_posted_this_cycle_flag = True
    return {"status": "message_processed", "analyzed_opinion": user_opinion_vector}

@app.post("/api/reset_simulation")
async def reset_simulation_api(config: ResetConfig):
    global simulation_task, network_instance, poster_instance, SIM_PARAMS, current_bot_names, OPINION_AXES, user_posted_this_cycle_flag
    
    print(f"Resetting simulation with config: {config}")
    if simulation_task and not simulation_task.done():
        simulation_task.cancel()
        try:
            await simulation_task
        except asyncio.CancelledError:
            print("Previous simulation task cancelled successfully for reset.")
        finally:
            simulation_task = None 

    if config.include_strategic_agents is not None:
        SIM_PARAMS["include_strategic_agents"] = config.include_strategic_agents
    if config.seed is not None: 
        SIM_PARAMS["seed"] = config.seed
        print(f"Simulation seed updated to: {SIM_PARAMS['seed']}")

    initialize_network_and_poster() 
    user_posted_this_cycle_flag = False # Reset this flag as well

    if network_instance and poster_instance:
        simulation_task = asyncio.create_task(simulation_loop_task())
        print("New simulation loop task created and started after reset.")
        
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
            print("Broadcasted reset_complete with full new state.")
            return {"message": "Simulation reset successfully and new state broadcasted."}
        except Exception as e:
            print(f"Error broadcasting full state after reset: {e}")
            return {"message": "Simulation reset but failed to broadcast new state fully."}
    else:
        print("Error: Failed to re-initialize network/poster after reset. Simulation loop not started.")
        raise HTTPException(status_code=500, detail="Failed to re-initialize simulation after reset.")


@app.websocket("/ws/simulation_updates")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Consider sending initial state immediately upon connection
        # if network_instance: # check if available
        #     initial_state_data = _create_simulation_state_payload(network_instance, SIM_PARAMS, current_bot_names.tolist(), OPINION_AXES)
        #     await websocket.send_json({"type": "initial_state_full", "data": initial_state_data})

        while True:
            data = await websocket.receive_text() 
    except WebSocketDisconnect:
        print(f"Client {websocket.client} disconnected")
    except Exception as e:
        print(f"WebSocket Error for {websocket.client}: {e}")
    finally:
        manager.disconnect(websocket)


async def simulation_loop_task():
    global network_instance, poster_instance, SIM_PARAMS, current_bot_names, manager, user_posted_this_cycle_flag
    
    if not network_instance or not poster_instance:
        print("Error: Network or Poster not initialized. Simulation loop cannot start.")
        return

    print("Simulation loop started...")
    
    while True: 
        try:
            # Make a local copy of the flag for this cycle and reset global immediately
            # This is a common pattern for handling such flags in loops.
            user_acted_this_cycle = user_posted_this_cycle_flag
            if user_acted_this_cycle:
                 user_posted_this_cycle_flag = False # Reset global flag after reading

            current_time = time.time() # Not used currently, but good for future timing logic
            last_post_time_cycle = current_time 

            if poster_instance and network_instance:
                X_state, A_state, _ = network_instance.get_state() 
                
                num_bots_to_post = SIM_PARAMS.get("posts_per_cycle", 1)
                agent_indices_all = list(range(SIM_PARAMS["n_agents"]))
                
                eligible_posters = [idx for idx in agent_indices_all if idx != 0] # Exclude user (agent 0)
                
                posting_bots_indices = []
                if eligible_posters:
                    posting_bots_indices = random.sample(eligible_posters, min(num_bots_to_post, len(eligible_posters)))
                
                # Strategic agent posting logic (simplified - ensure one strategic posts if possible)
                if SIM_PARAMS.get("include_strategic_agents"):
                    num_strategic = len(SIM_PARAMS.get("strategic_agents_initial_opinion_targets",[]))
                    if num_strategic > 0:
                        strategic_indices = list(range(SIM_PARAMS["n_agents"] - num_strategic, SIM_PARAMS["n_agents"]))
                        # If no strategic agent was chosen randomly and there's space, add one
                        if not any(idx in posting_bots_indices for idx in strategic_indices) and strategic_indices:
                            chosen_strategic = random.choice(strategic_indices)
                            if len(posting_bots_indices) < num_bots_to_post:
                                if chosen_strategic not in posting_bots_indices:
                                    posting_bots_indices.append(chosen_strategic)
                            elif posting_bots_indices: # If full, replace a non-strategic one
                                non_strategic_in_list = [idx for idx in posting_bots_indices if idx not in strategic_indices]
                                if non_strategic_in_list:
                                    posting_bots_indices.remove(random.choice(non_strategic_in_list))
                                    if chosen_strategic not in posting_bots_indices:
                                        posting_bots_indices.append(chosen_strategic)
                
                random.shuffle(posting_bots_indices) # Shuffle post order

                for agent_idx in posting_bots_indices:
                    if not network_instance: break 
                    agent_opinion = X_state[agent_idx]
                    agent_name = current_bot_names[agent_idx] if agent_idx < len(current_bot_names) else f"Agent {agent_idx}"
                    
                    is_strategic_agent = False
                    if SIM_PARAMS.get("include_strategic_agents"):
                        num_strat_conf = len(SIM_PARAMS.get("strategic_agents_initial_opinion_targets",[]))
                        if agent_idx >= (SIM_PARAMS["n_agents"] - num_strat_conf):
                            is_strategic_agent = True
                    
                    try:
                        post_delay = SIM_PARAMS.get("time_between_posts", 0.1)
                        # Check if enough time has passed since the *cycle's* last post time
                        if time.time() - last_post_time_cycle < post_delay:
                             await asyncio.sleep(max(0, post_delay - (time.time() - last_post_time_cycle))) # ensure non-negative sleep
                        
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
                        last_post_time_cycle = time.time() # Update last post time for this cycle
                    except Exception as e:
                        print(f"DETAILED ERROR generating/broadcasting post for {agent_name}: TYPE={type(e)}, MSG='{str(e)}', REPR='{repr(e)}'")
                        
                        await manager.broadcast_json({
                            "type": "system_message",
                            "data": {"message": f"System: Error with {agent_name}'s post."}
                        })

            if network_instance:
                updates_log_messages = [] 
                for i in range(SIM_PARAMS.get("updates_per_cycle", 1)):
                    if not network_instance: break 
                    network_instance.update_network(include_user_opinions=user_acted_this_cycle if i == 0 else False)
                
                if updates_log_messages: # This part is not currently generating logs from network_instance
                    await manager.broadcast_json({
                        "type": "updates_log",
                        "data": updates_log_messages
                    })

            if network_instance:
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
            print("Simulation loop task cancelled.")
            break
        except Exception as e:
            print(f"Error in simulation loop: {e}")
            await asyncio.sleep(1) 

# --- Static Files and Main Route ---
app.mount("/static", StaticFiles(directory=PROJECT_ROOT / "frontend" / "static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse(PROJECT_ROOT / "frontend" / "index.html")

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# To run this app:
# cd opinion_dynamics_webapp/backend
# uvicorn main_app:app --reload 