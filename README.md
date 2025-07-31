# Opinion Dynamics Network

An interactive opinion dynamics simulation that demonstrates how social media posts influence group opinions in real-time.

## 🍍 The Pineapple Pizza Debate

Watch as opinions shift and evolve across a network as agents reinforce ties with those they agree with and drift from those they don't. Your goal is to try to steer the crowd toward a consensus on the age-old debate: does pineapple belong on pizza?

## 🎮 How to Use

1. **Choose Your Opinion**: Select from a variety of preselected responses that range from strongly against to strongly for pineapple on pizza
2. **Post Your Opinion**: Click "Post Opinion" to add your voice to the network
3. **Watch the Network**: See how your opinion influences the network and how other agents respond
4. **Control the Simulation**: Use the play/pause and reset buttons to control the simulation

## 🔬 Why It Matters

Behind the fun is real research on how bots and AI-powered influencers can sway public opinion, fueling unity, polarization, or manipulation. This simulation demonstrates the principles of opinion dynamics in social networks.

## 🧮 Mathematical Model: Custom Opinion Dynamics

This simulation uses a custom opinion dynamics model designed for intuitive visualization and educational clarity. The core idea is that each agent's opinion is represented as a number between 0 and 1 (where 0 = "strongly against", 1 = "strongly for"), and agents are connected in a network where the strength and length of edges represent how similar or different their opinions are.

### **Opinion Update Rule**

The algorithm uses a sophisticated matrix-based approach where opinions are updated through a weighted averaging process. The update rule is:

$$X^{(t+1)} = X^{(t)} + \text{clip}\left(\alpha \cdot (W \cdot X^{(t)} - X^{(t)}), -\Delta_{\max}, \Delta_{\max}\right)$$

where:
- $X^{(t)}$: Vector of all agent opinions at time $t$
- $W$: A normalized weight matrix that depends on the current opinion similarities
- $\alpha$: Smoothing/filter parameter (controls how fast opinions change)
- $\Delta_{\max}$: Maximum allowed opinion change per step (prevents sudden jumps)
- The `clip` function ensures the opinion change is within $[-\Delta_{\max}, \Delta_{\max}]$

The weight matrix $W$ is constructed through several steps:

1. **Similarity normalization** ($s_{norm}$): A matrix that captures how similar each agent's opinions are to others, normalized so each row sums to 1
2. **Network structure** ($A$): Binary adjacency matrix (0s and 1s) representing who is connected to whom in the network
3. **Final weight matrix** ($W$): Constructed as:
   $$W = s_{norm} \cdot A + I - \text{diag}(s_{norm} \cdot A \cdot \mathbf{1})$$
   
   Where:
   - $s_{norm} \cdot A$: Element-wise multiplication of similarity and network structure
   - $I$: Identity matrix (preserves each agent's own opinion)
   - $\text{diag}(s_{norm} \cdot A \cdot \mathbf{1})$: Diagonal matrix that ensures each row of $W$ sums to 1

This construction ensures that $W$ is a **stochastic matrix** (each row sums to 1), which means the opinion update is a weighted average where each agent's new opinion is a convex combination of their own opinion and their neighbors' opinions.

### **How a Single Agent's Opinion Changes**

For each agent $i$, the opinion update at each step works as follows:

1. **Weighted Average of Neighbors:**
   - Compute a weighted sum of all agents' current opinions:
     $$
     x_i^{\text{new}} = \sum_{j} W_{ij} x_j^{(t)}
     $$
     where $W_{ij}$ is how much agent $j$ influences agent $i$.

2. **Apply Smoothing (Alpha Filter):**
   - Blend the new suggested opinion with the agent's current opinion:
     $$
     x_i^{\text{filtered}} = \alpha \cdot x_i^{\text{new}} + (1 - \alpha) \cdot x_i^{(t)}
     $$
     where $\alpha$ controls how quickly opinions can change.

3. **Constrain the Change (Clipping):**
   - Limit how much the opinion can change in one step:
     $$
     \Delta x_i = \text{clip}(x_i^{\text{filtered}} - x_i^{(t)},\ -\Delta_{\max},\ \Delta_{\max})
     $$
     where $\Delta_{\max}$ is the maximum allowed change per step.

4. **Update the Opinion:**
   - The agent's new opinion is:
     $$
     x_i^{(t+1)} = x_i^{(t)} + \Delta x_i
     $$

**In plain English:**
- Each agent looks at all other agents' opinions, weighted by how similar and connected they are.
- The agent computes a weighted average of these opinions.
- The agent moves a fraction ($\alpha$) of the way toward this average, but never more than $\Delta_{\max}$ in one step.
- This process repeats at each time step, leading to gradual convergence or polarization.

### **Edge Weights and Visualization**

- **Edge Weight:** The weight between two agents is calculated as:
  $$W_{ij} = \frac{1}{1 + |x_i - x_j|}$$
  This is used **only for visualization** - it determines how close nodes appear in the network display.
- **Edge Length:** In the network visualization, the length of an edge is proportional to the distance in opinion space. When two agents have similar opinions, their nodes are drawn closer together; when their opinions diverge, the edge stretches, and they move apart.
- **Convergence:** As agents interact and update their opinions through the matrix multiplication process, those with similar views tend to converge, visually represented by nodes moving closer together. If the network polarizes, you'll see distinct groups form and drift apart.

### **Why This Model?**

- **Intuitive Visualization:** By directly mapping opinion distance to edge length, the simulation makes abstract opinion dynamics visible and easy to understand.
- **Custom for Education:** Unlike some classic models (e.g., DeGroot, Hegselmann-Krause), this model is tuned for gradual, visually smooth convergence and clear group formation, making it ideal for demonstration and teaching.

## 🌐 Live Demo

🎉 **The site is now live!** Visit the live demo to try it out yourself:

**[https://adameubanks.github.io/opinion-dynamics-network/](https://adameubanks.github.io/opinion-dynamics-network/)**

Experience the opinion dynamics simulation in action - no setup required!