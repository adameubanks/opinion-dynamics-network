import numpy as np

def diag(v):
    n = len(v)
    return np.array([[v[j] if i == j else 0 for j in range(n)] for i in range(n)])

def get_r(M, epsilon=1e-10):
    return M / (np.sum(M, axis=1, keepdims=True) + epsilon)

def get_d_norm(M, epsilon=1e-10):
    n = len(M)
    D = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            D[i, j] = np.sqrt(np.sum((M[i] - M[j]) ** 2))
    return get_r(D, epsilon=epsilon)

def get_s_norm(M, epsilon=1e-10):
    n = len(M)
    return get_r(1 - (np.identity(n) + get_d_norm(M, epsilon=epsilon)), epsilon=epsilon)

def get_row_scaled_matrix(M):
    n = M.shape[0]
    diag_mask = np.eye(n, dtype=bool)
    row_min = np.where(diag_mask, np.inf, M).min(axis=1)[:, None]
    row_max = np.where(diag_mask, -np.inf, M).max(axis=1)[:, None]
    diff = row_max - row_min
    S = (M - row_min) / np.where(diff == 0, 1, diff)
    S[diag_mask] = 0
    return S

def get_W(s_norm, A):
    n = len(s_norm)
    return s_norm * A + np.identity(n) - diag((s_norm * A) @ np.ones(n))

def create_similarity_connections(X, max_distance=0.3):
    """Create adjacency matrix based on opinion similarity. Closer opinions = connected."""
    n = X.shape[0]
    A = np.zeros((n, n), dtype=int)
    
    for i in range(n):
        for j in range(i + 1, n):
            # Calculate opinion distance
            opinion_distance = np.sqrt(np.sum((X[i] - X[j]) ** 2))
            # Connect if within similarity threshold
            if opinion_distance <= max_distance:
                A[i, j] = 1
                A[j, i] = 1
    
    return A

def calculate_edge_weights(X):
    """Calculate edge weights based on opinion distance. Closer opinions = higher weights."""
    n = X.shape[0]
    weights = np.zeros((n, n))
    
    for i in range(n):
        for j in range(n):
            if i != j:
                # Calculate opinion distance
                opinion_distance = np.sqrt(np.sum((X[i] - X[j]) ** 2))
                # Convert to weight (closer opinions = higher weight)
                weights[i, j] = 1.0 / (1.0 + opinion_distance)
            else:
                weights[i, j] = 1.0
    
    return weights

def update_A(s_norm, theta=1, min_prob=0.01):
    s_hat = get_row_scaled_matrix(s_norm) ** theta
    s_hat[s_hat < min_prob] = min_prob
    s_hat -= np.triu(s_hat)
    A = s_hat - np.random.random(s_hat.shape)
    A[A < 0] = 0
    A[A > 0] = 1
    A = A.astype(int)
    return np.maximum(A, A.T)

def get_strategic_opinion(a, X, target, theta=7):
    if np.sum(a) > 0:
        neighbor_x = X.copy()[a == 1]
        if len(neighbor_x) == 0:
            return np.mean(X, axis=0)
        
        neighbor_dists = np.sqrt(np.sum((neighbor_x - target) ** 2, axis=1))
        # Prevent zero distances which cause divide by zero
        neighbor_dists = np.maximum(neighbor_dists, 1e-10)
        
        weights = np.append(neighbor_dists, np.min(neighbor_dists) / 2)
        weights_sum = np.sum(weights)
        if weights_sum > 0:
            weights /= weights_sum
            # Prevent overflow in power operation
            weights = np.minimum(weights, 1.0)
            if theta > 0:
                weights = weights ** min(theta, 50)  # Cap theta to prevent overflow
            weights_sum_after = np.sum(weights)
            if weights_sum_after > 0:
                weights /= weights_sum_after
                return weights @ np.vstack((neighbor_x, target))
            else:
                return target
        else:
            return target
    else:
        return np.mean(X, axis=0)

def is_extreme_opinion(opinion, threshold_low=0.45, threshold_high=0.55):
    """Check if opinion is extreme (outside neutral range)."""
    return opinion < threshold_low or opinion > threshold_high

def same_side_of_center(opinion1, opinion2, center=0.5):
    """Check if two opinions are on the same side of center."""
    return (opinion1 < center and opinion2 < center) or (opinion1 > center and opinion2 > center)

class Network:
    def __init__(self, n_agents=50, n_opinions=3, X=None, A=None, theta=7, min_prob=0.01, alpha_filter=0.5,
                 user_agents=[], user_alpha=0.5, strategic_agents=[], strategic_theta=-100, max_connection_distance=0.3):
        assert n_agents > 0 and isinstance(n_agents, (int, np.integer))
        assert n_opinions > 0 and isinstance(n_opinions, (int, np.integer))
        assert theta >= 0
        assert 0 <= min_prob <= 1
        assert 0 < alpha_filter <= 1

        self.n_agents = n_agents
        self.n_opinions = n_opinions
        self.theta = theta
        self.min_prob = min_prob
        self.alpha_filter = alpha_filter
        self.max_connection_distance = max_connection_distance
        self.time_step = 0

        if X is None:
            self.X = np.random.random((n_agents, n_opinions))
        else:
            assert X.shape == (n_agents, n_opinions)
            self.X = X.copy()

        assert len(user_agents) + len(strategic_agents) <= n_agents

        self.n_user_agents = len(user_agents)
        self.user_agents = user_agents.copy()
        self.user_alpha = user_alpha
        for i in range(self.n_user_agents):
            if self.user_agents[i] is None:
                self.user_agents[i] = self.X[i]
            else:
                assert len(self.user_agents[i]) == n_opinions
                self.X[i] = self.user_agents[i]
        self.user_agents = np.array(self.user_agents)

        self.n_strategic_agents = len(strategic_agents)
        self.strategic_agents = strategic_agents.copy()
        self.strategic_theta = strategic_theta
        for i in range(self.n_strategic_agents):
            if self.strategic_agents[i] is None:
                self.strategic_agents[i] = self.X[i + self.n_agents - self.n_strategic_agents]
            else:
                assert len(self.strategic_agents[i]) == n_opinions
            self.X[i + self.n_agents - self.n_strategic_agents] = np.mean(self.X[:-self.n_strategic_agents], axis=0)
        self.strategic_agents = np.array(self.strategic_agents)

        # Create similarity-based connectivity adjacency matrix
        self.A = create_similarity_connections(self.X, max_distance=self.max_connection_distance)
        
        # Calculate initial edge weights
        self.edge_weights = calculate_edge_weights(self.X)

    def get_state(self):
        return self.X.copy(), self.A.copy(), self.time_step, self.edge_weights.copy()

    def add_user_opinion(self, opinion, user_index=0):
        assert 0 <= user_index < self.n_user_agents
        self.user_agents[user_index] = self.user_alpha * np.array(opinion) + (1 * self.user_alpha) * self.user_agents[user_index]
        self.X[user_index] = self.user_agents[user_index]

    def update_network(self, include_user_opinions=True):
        s_norm = get_s_norm(self.X)
        # Use current adjacency matrix - connections are updated based on opinion similarity
        adjusted_A = self.A.copy()
        
        new_X = get_W(s_norm, adjusted_A) @ self.X

        if self.n_strategic_agents > 0:
            for i in range(self.n_strategic_agents):
                new_X[i + self.n_agents - self.n_strategic_agents] = get_strategic_opinion(adjusted_A[i + self.n_agents - self.n_strategic_agents], self.X, self.strategic_agents[i], theta=self.strategic_theta)

        self.X = self.alpha_filter * new_X + (1 - self.alpha_filter) * self.X
        
        # Update connections based on new opinion similarities
        self.A = create_similarity_connections(self.X, max_distance=self.max_connection_distance)
        
        # Update edge weights based on current opinions
        self.edge_weights = calculate_edge_weights(self.X)
        
        self.time_step += 1

        if self.n_user_agents > 0:
            self.X[:self.n_user_agents] = self.user_agents

        return self.get_state()

    def apply_user_post_influence(self, user_index, analyzed_opinion, influence_strength=0.1, second_degree_decay=0.3):
        """Apply user post influence to connected agents with reduced strength for extreme posts."""
        # Input validation
        assert 0 <= user_index < self.n_agents
        assert len(analyzed_opinion) == self.n_opinions
        assert 0 < influence_strength <= 1
        assert 0 <= second_degree_decay <= 1
        
        # Calculate influence vector (message drift)
        current_user_opinion = self.X[user_index]
        influence_vector = np.array(analyzed_opinion) - current_user_opinion
        
        # Calculate connection matrices
        A_squared = self.A @ self.A
        
        # Create combined influence matrix (1st degree full, 2nd degree reduced)
        influence_matrix = self.A + second_degree_decay * A_squared
        
        # Apply influence only from the posting user
        user_influence_weights = influence_matrix[user_index]
        
        # Adjust influence strength based on post extremeness
        post_opinion = analyzed_opinion[0]  # Assuming single opinion dimension for extremeness check
        if is_extreme_opinion(post_opinion):
            # Extreme post - use much smaller influence to create gradual polarization
            effective_strength = influence_strength * 0.2  # 20% of normal strength
        else:
            # Neutral post - use normal influence strength for convergence
            effective_strength = influence_strength
        
        # Apply influence to all agents based on their connection distance
        for i in range(self.n_agents):
            if user_influence_weights[i] > 0:  # Only influence connected agents
                self.X[i] += effective_strength * user_influence_weights[i] * influence_vector
        
        # Ensure opinions stay within bounds [0, 1]
        self.X = np.clip(self.X, 0, 1)
        
        # Restore user agent opinion (users maintain their own opinions)
        if self.n_user_agents > 0:
            self.X[:self.n_user_agents] = self.user_agents 