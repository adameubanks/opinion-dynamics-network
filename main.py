import tkinter as tk
from tkinter import ttk
import threading, time, math
import matplotlib
matplotlib.use("TkAgg")
from matplotlib.figure import Figure
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import numpy as np
import networkx as nx
import random
from scipy.stats import beta
import os
from dotenv import load_dotenv

load_dotenv()

from network_backend import Network, get_d_norm
from chatgpt_interface import Poster

# ------------------- Global Parameters -------------------
include_strategic_agents = True
seed = 40
n_agents = 20
n_opinions = 2

init_opinion_one = beta.rvs(a=2, b=2, size=n_agents, random_state=seed)
init_opinion_two = beta.rvs(a=14, b=7, size=n_agents, random_state=seed)
init_X = None

theta = 5
min_prob = 0.03
alpha_filter = 1.0
user_agents = [[0.5, 0.5]]
user_alpha = 0.5
strategic_agents = []
strategic_theta = -1.5
time_between_posts = 3
updates_per_cycle = 8
posts_per_cycle = 7
init_updates = 0

api_key = os.getenv("OPENAI_API_KEY")

opinion_axes = [
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

bot_names = np.array([
    "User", "Margaret", "Betty", "Janice", "Diane", "Gloria", "Mildred", "Agnes", "Marjorie", "Carol",
    "Helen", "Dorothy", "Beatrice", "Shirley", "Phyllis", "Irene", "Eleanor", "Norma", "Vladi-meow", "Pineapple Dmit-za"
])

# ------------------- Color Scaling Helpers -------------------
def color_formula(scaled_x, scaled_y):
    """
    Applies your "intensity" formula on scaled_x, scaled_y in [0..1].
    intensity = sqrt(x^2 + y^2) / sqrt(2)
    r = intensity * x + (1 - intensity)
    g = (1 - intensity)
    b = intensity * y + (1 - intensity)
    """
    intensity = math.sqrt(scaled_x*scaled_x + scaled_y*scaled_y) / math.sqrt(2)
    r = intensity * scaled_x + (1 - intensity)
    g = (1 - intensity)
    b = intensity * scaled_y + (1 - intensity)
    return r, g, b

def scale_and_color(x, y, x_min, x_max, y_min, y_max):
    """
    Scale x,y into [0.5..1.0] relative to (x_min..x_max) and (y_min..y_max).
    Then apply color_formula to get (R,G,B).

    If x_min == x_max, we default scaled_x = 0.75 (midpoint of [0.5..1.0]),
    same for y_min == y_max => scaled_y = 0.75.
    """
    if x_max > x_min:
        sx_01 = (x - x_min) / (x_max - x_min)  # normalized to [0..1]
        sx = 0.5 + 0.5 * sx_01                # now in [0.5..1.0]
    else:
        sx = 0.75

    if y_max > y_min:
        sy_01 = (y - y_min) / (y_max - y_min)
        sy = 0.5 + 0.5 * sy_01
    else:
        sy = 0.75

    r, g, b = color_formula(sx, sy)
    return f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}"

# ------------------- Scrollable Frame for Feed -------------------
class ScrollableFrame(tk.Frame):
    def __init__(self, container, *args, **kwargs):
        super().__init__(container, *args, **kwargs)
        self.canvas = tk.Canvas(self, borderwidth=0, background="#ffffff")
        self.scrollbar = tk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.scrollable_frame = tk.Frame(self.canvas, background="#ffffff")
        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )
        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=self.scrollbar.set)
        self.canvas.pack(side="left", fill="both", expand=True)
        self.scrollbar.pack(side="right", fill="y")

# ------------------- Main ChatGUI Class -------------------
class ChatGUI:
    """
    This class represents the main simulation GUI (feed, updates, visualizations).
    After the user chooses settings from the start screen, the ChatGUI is instantiated.
    """
    def __init__(self, root, w_controllers, reset_callback):
        self.root = root
        self.root.title("Social Network Simulation")
        self.reset_callback = reset_callback

        # Store user selection about controllers
        self.include_strategic_agents = w_controllers

        # We'll store min/max in instance vars for feed color consistency
        self.x_min = None
        self.x_max = None
        self.y_min = None
        self.y_max = None

        # Overwrite global parameters that depend on w_controllers
        self.setup_global_params()

        # Create main frames
        self.frame_main = tk.Frame(self.root)
        self.frame_main.pack(fill="both", expand=True)

        # Sub-frames for feed, updates, visualization
        self.frame_feed = tk.Frame(self.frame_main, bd=2, relief=tk.SUNKEN, width=420, height=800)
        self.frame_updates = tk.Frame(self.frame_main, bd=2, relief=tk.SUNKEN, width=200, height=800)
        self.frame_vis = tk.Frame(self.frame_main, bd=2, relief=tk.SUNKEN, width=680, height=800)

        self.frame_feed.grid(row=0, column=0, sticky="nsew")
        self.frame_updates.grid(row=0, column=1, sticky="nsew")
        self.frame_vis.grid(row=0, column=2, sticky="nsew")

        self.frame_main.grid_columnconfigure(0, minsize=420, weight=1)
        self.frame_main.grid_columnconfigure(1, minsize=200, weight=0)
        self.frame_main.grid_columnconfigure(2, minsize=680, weight=1)
        self.frame_main.grid_rowconfigure(0, weight=1)

        # Prevent frames from resizing to fit content
        self.frame_feed.grid_propagate(False)
        self.frame_updates.grid_propagate(False)
        self.frame_vis.grid_propagate(False)

        # ---------- Feed Section (Scrollable) ----------
        self.feed_frame = ScrollableFrame(self.frame_feed)
        self.feed_frame.pack(fill=tk.BOTH, expand=True)

        # Bottom panel for user entry + Reset
        bottom_panel = tk.Frame(self.frame_feed)
        bottom_panel.pack(side="bottom", fill="x")

        self.entry_message = tk.Entry(bottom_panel)
        self.entry_message.pack(side="left", fill="x", expand=True)
        self.entry_message.bind("<Return>", self.send_message_event)

        self.button_send = tk.Button(bottom_panel, text="Send", command=self.send_message)
        self.button_send.pack(side="left")

        self.button_reset = tk.Button(bottom_panel, text="Reset", command=self.handle_reset)
        self.button_reset.pack(side="right")

        # ---------- Updates Section ----------
        self.updates_feed = tk.Text(self.frame_updates, wrap="word", state="disabled", width=20)
        self.updates_feed.pack(fill=tk.BOTH, expand=True)

        # ---------- Visualization Section ----------
        self.notebook = ttk.Notebook(self.frame_vis)
        self.notebook.pack(fill=tk.BOTH, expand=True)

        self.tab_opinions = tk.Frame(self.notebook)
        self.tab_connections = tk.Frame(self.notebook)
        self.notebook.add(self.tab_opinions, text="Opinions")
        self.notebook.add(self.tab_connections, text="Connections")

        self.fig_opinions = Figure(figsize=(4, 3), dpi=100)
        self.ax_opinions = self.fig_opinions.add_subplot(111)
        self.canvas_opinions = FigureCanvasTkAgg(self.fig_opinions, master=self.tab_opinions)
        self.canvas_opinions.get_tk_widget().pack(fill=tk.BOTH, expand=True)

        self.fig_connections = Figure(figsize=(4, 3), dpi=100)
        self.ax_connections = self.fig_connections.add_subplot(111)
        self.canvas_connections = FigureCanvasTkAgg(self.fig_connections, master=self.tab_connections)
        self.canvas_connections.get_tk_widget().pack(fill=tk.BOTH, expand=True)

        # ---------- Initialize Network and Poster ----------
        np.random.seed(seed)
        random.seed(seed)

        global init_opinion_one, init_opinion_two
        init_opinion_one = beta.rvs(a=2, b=2, size=n_agents, random_state=seed)
        init_opinion_two = beta.rvs(a=14, b=7, size=n_agents, random_state=seed)
        np.random.shuffle(init_opinion_one)
        np.random.shuffle(init_opinion_two)

        init_X = np.column_stack((init_opinion_one, init_opinion_two))

        self.network = Network(
            n_agents=n_agents,
            n_opinions=n_opinions,
            X=init_X.copy(),
            theta=theta,
            min_prob=min_prob,
            alpha_filter=alpha_filter,
            user_agents=user_agents,
            user_alpha=user_alpha,
            strategic_agents=strategic_agents,
            strategic_theta=strategic_theta
        )

        self.poster = Poster(api_key, opinion_axes)

        # For thread-safe handling of user posts
        self.pending_user_post = None
        self.user_post_flag = False
        self.user_post_lock = threading.Lock()

        # Start simulation loop in background
        self.running = True
        self.sim_thread = threading.Thread(target=self.simulation_loop, daemon=True)
        self.sim_thread.start()

    def setup_global_params(self):
        """
        Overwrite the global simulation parameters depending on whether
        controllers are included or not.
        """
        global include_strategic_agents
        global strategic_agents
        global updates_per_cycle
        global time_between_posts
        global posts_per_cycle
        global bot_names

        include_strategic_agents = self.include_strategic_agents
        if include_strategic_agents:
            strategic_agents = [[0, 1], [1, 0.5]]
            updates_per_cycle = 3
            time_between_posts = 0.5
            posts_per_cycle = 2
            bot_names[-2:] = ["Vladi-meow", "Pineapple Dmit-za"]
        else:
            strategic_agents = []
            updates_per_cycle = 3
            time_between_posts = 0
            posts_per_cycle = 2
            bot_names[-2:] = ["Anita", "Orva"]

    def handle_reset(self):
        """
        Called by the 'Reset' button. We'll stop the simulation thread
        and then return to the start screen.
        """
        self.running = False
        time.sleep(0.5)
        self.reset_callback()

    def send_message_event(self, event):
        self.send_message()

    def send_message(self):
        message = self.entry_message.get().strip()
        if message:
            X, _, _ = self.network.get_state()
            opinion = X[0] if X.shape[0] > 0 else [0.5, 0.5]
            self.add_feed_message("User: " + message, sender_index=0, opinion_vector=opinion)
            with self.user_post_lock:
                self.pending_user_post = message
                self.user_post_flag = True
            self.entry_message.delete(0, tk.END)

    def add_feed_message(self, msg, sender_index, opinion_vector):
        """
        Adds a post to the feed, coloring the border with the same logic
        used in the visualization:
         - user index 0 => gold
         - strategic => black
         - normal => scale_and_color with cached min/max
        """
        if sender_index == 0:
            border_color = "gold"
        elif sender_index >= n_agents - len(strategic_agents):
            border_color = "black"
        else:
            # Normal agent => use x_min..x_max, y_min..y_max from our cached values
            if self.x_min is not None and self.x_max is not None:
                x_val, y_val = opinion_vector[0], opinion_vector[1]
                border_color = scale_and_color(x_val, y_val,
                                               self.x_min, self.x_max,
                                               self.y_min, self.y_max)
            else:
                # If we haven't set them yet, just show gray as a fallback
                border_color = "gray"

        post_frame = tk.Frame(
            self.feed_frame.scrollable_frame,
            bd=2,
            relief="solid",
            highlightthickness=2,
            highlightbackground=border_color,
            padx=5,
            pady=5
        )
        label = tk.Label(post_frame, text=msg, wraplength=400, justify="left")
        label.pack(fill="x")
        post_frame.pack(fill="x", padx=5, pady=5)

        self.feed_frame.canvas.update_idletasks()
        self.feed_frame.canvas.yview_moveto(1.0)

    def update_updates(self, updates_list):
        def update():
            self.updates_feed.configure(state="normal")
            self.updates_feed.delete("1.0", tk.END)
            for u in updates_list:
                self.updates_feed.insert(tk.END, u + "\n")
            self.updates_feed.configure(state="disabled")
        self.root.after(0, update)

    def update_visualizations(self, X, A):
        """
        Updates both the opinions scatter plot and the connections graph.
        Also caches the normal agents' x_min..x_max, y_min..y_max
        for coloring feed post borders consistently.
        """
        def update_figures():
            num_strategic = len(strategic_agents)
            normal_indices = list(range(1, n_agents - num_strategic))

            if len(normal_indices) > 0:
                normal_x = X[normal_indices, 0]
                normal_y = X[normal_indices, 1]
                self.x_min, self.x_max = normal_x.min(), normal_x.max()
                self.y_min, self.y_max = normal_y.min(), normal_y.max()
            else:
                # If everything is user + strategic, fallback
                self.x_min, self.x_max = 0.0, 1.0
                self.y_min, self.y_max = 0.0, 1.0

            # --- Opinions Tab ---
            self.ax_opinions.clear()

            scatter_colors = []
            for i in range(n_agents):
                if i == 0:
                    scatter_colors.append("gold")
                elif i >= n_agents - num_strategic:
                    scatter_colors.append("black")
                else:
                    x_val = X[i, 0]
                    y_val = X[i, 1]
                    c = scale_and_color(x_val, y_val, self.x_min, self.x_max, self.y_min, self.y_max)
                    scatter_colors.append(c)

            x_vals = X[:, 0]
            y_vals = X[:, 1]
            self.ax_opinions.scatter(x_vals, y_vals, c=scatter_colors, edgecolors="none", s=50)

            # Circles around user & strategic
            if len(X) > 0:
                self.ax_opinions.scatter(X[0, 0], X[0, 1],
                                         facecolors="none", edgecolors="gold",
                                         s=150, linewidths=2)
            for idx in range(n_agents - num_strategic, n_agents):
                self.ax_opinions.scatter(X[idx, 0], X[idx, 1],
                                         facecolors="none", edgecolors="black",
                                         s=150, linewidths=2)

            self.ax_opinions.set_title("Distribution of Opinions")
            self.ax_opinions.set_xlabel("Opinion on Pineapple on Pizza")
            self.ax_opinions.set_ylabel("Opinion on Cats")

            self.ax_opinions.relim()
            self.ax_opinions.autoscale_view()
            self.canvas_opinions.draw()

            # --- Connections Tab ---
            self.ax_connections.clear()
            G = nx.from_numpy_array(np.array(A))

            node_colors = []
            for i in range(n_agents):
                if i == 0:
                    node_colors.append("gold")
                elif i >= n_agents - num_strategic:
                    node_colors.append("black")
                else:
                    x_val = X[i, 0]
                    y_val = X[i, 1]
                    c = scale_and_color(x_val, y_val, self.x_min, self.x_max, self.y_min, self.y_max)
                    node_colors.append(c)

            pos = nx.spring_layout(G, seed=1)
            nx.draw(G, pos=pos,
                    node_color=node_colors,
                    node_size=50,
                    width=0.25,
                    edgecolors='none',
                    ax=self.ax_connections)

            highlight = [0] + [i for i in range(n_agents - num_strategic, n_agents)]
            if highlight:
                highlight_colors = [node_colors[h] for h in highlight]
                edge_cols = ["gold" if h == 0 else "black" for h in highlight]
                nx.draw_networkx_nodes(
                    G,
                    pos,
                    nodelist=highlight,
                    node_color=highlight_colors,
                    edgecolors=edge_cols,
                    node_size=100,
                    linewidths=2.5,
                    ax=self.ax_connections
                )

            self.ax_connections.set_title("Network Connections")
            self.ax_connections.axis('off')
            self.canvas_connections.draw()

        self.root.after(0, update_figures)

    def simulation_loop(self):
        global bot_names

        last_post_time = time.time()
        for _ in range(init_updates):
            self.network.update_network(include_user_opinions=False)
        user_posted_last_cycle = False
        X, A, _ = self.network.get_state()
        self.update_visualizations(X, A)

        while self.running:
            user_posted_last_cycle = False
            with self.user_post_lock:
                if self.user_post_flag:
                    try:
                        opinion_vector = self.poster.analyze_post(self.pending_user_post)
                    except Exception:
                        opinion_vector = [0.5, 0.5]
                    self.network.add_user_opinion(opinion_vector, user_index=0)
                    updates = []
                    for i in range(A.shape[0]):
                        if i != 0:
                            # connected or strategic => read
                            if A[0, i] == 1 or (i >= n_agents - len(strategic_agents)):
                                updates.append(f"{bot_names[i]} read your post.")
                            else:
                                updates.append(f"{bot_names[i]} ignored your post.")
                    self.update_updates(updates)
                    self.user_post_flag = False
                    self.pending_user_post = None
                    user_posted_last_cycle = True

            # Friend posts
            X, A, _ = self.network.get_state()  # refresh
            # differences = get_d_norm(X)[0]
            # differences[0] = np.inf
            # if include_strategic_agents:
            #     differences[-2:] = 0
            # friend_indices = list(differences.argsort()[:posts_per_cycle])
            friend_indices = np.arange(n_agents) if not include_strategic_agents else np.arange(n_agents - 2)
            random.shuffle(friend_indices)
            friend_indices = list(friend_indices[:posts_per_cycle])
            if include_strategic_agents:
                friend_indices.append(random.choice([18, 19]))
                random.shuffle(friend_indices)
            for friend in friend_indices:
                friend_opinion = X[friend]
                friend_name = bot_names[friend]
                if time.time() - last_post_time < time_between_posts:
                    time.sleep(time_between_posts - (time.time() - last_post_time))
                try:
                    is_strat = (include_strategic_agents and friend in [18, 19])
                    post = self.poster.generate_post(friend_name, friend_opinion, is_agent=is_strat)
                except Exception:
                    post = "Default post."
                self.add_feed_message(
                    f"{friend_name}: {post}",
                    sender_index=friend,
                    opinion_vector=friend_opinion
                )
                last_post_time = time.time()

            # Update network
            for _ in range(updates_per_cycle):
                X, A, _ = self.network.update_network(include_user_opinions=user_posted_last_cycle)
                user_posted_last_cycle = False

            # Update visualizations
            self.update_visualizations(X, A)

    def stop(self):
        self.running = False
        time.sleep(0.5)


# ------------------- App Class (Manages Start Screen and Simulation) -------------------
class App:
    def __init__(self, root):
        self.root = root
        self.root.title("Social Network Simulation")
        self.start_frame = None
        self.chat_gui = None

        self.show_start_screen()

    def show_start_screen(self):
        if self.start_frame is not None:
            self.start_frame.destroy()

        self.start_frame = tk.Frame(self.root)
        self.start_frame.pack(fill="both", expand=True)

        label = tk.Label(self.start_frame, text="Welcome to the Social Network Simulation!", font=("Arial", 16))
        label.pack(pady=20)

        self.controllers_var = tk.BooleanVar(value=True)
        checkbox = tk.Checkbutton(
            self.start_frame,
            text="Include Strategic Controllers",
            variable=self.controllers_var
        )
        checkbox.pack(pady=10)

        start_button = tk.Button(self.start_frame, text="Start Simulation", command=self.start_simulation)
        start_button.pack(pady=10)

    def start_simulation(self):
        w_controllers = self.controllers_var.get()

        self.start_frame.destroy()
        self.start_frame = None

        self.chat_gui = ChatGUI(self.root, w_controllers=w_controllers, reset_callback=self.reset_app)

    def reset_app(self):
        if self.chat_gui:
            self.chat_gui.stop()
            self.chat_gui.frame_main.destroy()
            self.chat_gui = None
        self.show_start_screen()


# ------------------- Main Entry Point -------------------
if __name__ == "__main__":
    root = tk.Tk()
    app = App(root)
    root.mainloop()
