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
            D[i, j] = np.sum(np.abs(M[i] - M[j]))
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
    s_hat = get_r(s_norm ** theta)
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
        neighbor_dists = np.sqrt(np.sum((neighbor_x - target) ** 2, axis=1))
        weights = np.append(neighbor_dists, np.min(neighbor_dists) / 2)
        weights /= np.sum(weights)
        weights = weights ** theta
        weights /= np.sum(weights)
        return weights @ np.vstack((neighbor_x, target))
    else:
        return np.mean(X, axis=0)

class Network:
    def __init__(self, n_agents=50, n_opinions=3, X=None, A=None, theta=7, min_prob=0.01, alpha_filter=0.5,
                 user_agents=[], user_alpha=0.5, strategic_agents=[], strategic_theta=-100):
        # Basic assertions
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
        self.time_step = 0

        if X is None:
            self.X = np.random.random((n_agents, n_opinions))
        else:
            assert X.shape == (n_agents, n_opinions)
            self.X = X.copy()

        # Ensure there is enough room for user and strategic agents.
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

        if A is None:
            self.A = update_A(get_s_norm(self.X), theta=theta, min_prob=min_prob)
            if self.n_strategic_agents > 0:
                self.A[-self.n_strategic_agents:, -self.n_strategic_agents:] = 0
        else:
            assert A.shape == (n_agents, n_agents)
            self.A = A.copy()

        self.edge_weights = calculate_edge_weights(self.X)

    def get_state(self):
        return self.X.copy(), self.A.copy(), self.time_step, self.edge_weights.copy()

    def add_user_opinion(self, opinion, user_index=0):
        assert 0 <= user_index < self.n_user_agents
        self.user_agents[user_index] = self.user_alpha * np.array(opinion) + (1 * self.user_alpha) * self.user_agents[user_index]
        self.X[user_index] = self.user_agents[user_index]

    def update_network(self, include_user_opinions=True):
        s_norm = get_s_norm(self.X)
        adjusted_A = self.A.copy()
        if include_user_opinions == False:
            adjusted_A[:self.n_user_agents] = 0
            adjusted_A[:, :self.n_user_agents] = 0
        new_X = get_W(s_norm, adjusted_A) @ self.X

        if self.n_strategic_agents > 0:
            for i in range(self.n_strategic_agents):
                new_X[i + self.n_agents - self.n_strategic_agents] = get_strategic_opinion(adjusted_A[i + self.n_agents - self.n_strategic_agents], self.X, self.strategic_agents[i], theta=self.strategic_theta)

        self.X = self.alpha_filter * new_X + (1 - self.alpha_filter) * self.X
        self.A = update_A(s_norm, theta=self.theta, min_prob=self.min_prob)
        self.time_step += 1

        if self.n_strategic_agents > 0:
            self.A[-self.n_strategic_agents:, -self.n_strategic_agents:] = 0

        if self.n_user_agents > 0:
            self.X[:self.n_user_agents] = self.user_agents

        self.edge_weights = calculate_edge_weights(self.X)

        return self.get_state() 