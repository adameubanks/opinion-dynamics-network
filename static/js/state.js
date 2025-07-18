export function createInitialState() {
    return {
        currentOpinions: [],
        previousOpinions: [],
        significantChangeThreshold: 0.05,
        lastSignificantUpdate: 0,
        agentNames: [],
        opinionAxes: [],
        nAgents: 0,
        userAgentIndex: 0,
        colorScalingParams: {},
        currentAdjacencyMatrix: [],
        simulationRunning: false,
        nodePositions: [],
        simulation: null,
        avatarData: [],
        linkElements: null,
        nodeElements: null,
        currentEdgeWeights: [],
        statisticsGroup: null,
        userHasPosted: false
    };
}

export function initializeSimulationState(stateData, state) {
    state.currentOpinions = stateData.opinions || [];
    state.agentNames = stateData.agent_names || [];
    state.opinionAxes = stateData.opinion_axes || [{name: 'X-Axis', pro:'', con:''}];
    state.nAgents = stateData.n_agents || 0;
    state.userAgentIndex = stateData.user_agent_index !== undefined ? stateData.user_agent_index : 0;
    state.colorScalingParams = stateData.color_scaling_params || {x_min:0, x_max:1};
    state.currentAdjacencyMatrix = stateData.adjacency_matrix || [];
    state.currentEdgeWeights = stateData.edge_weights || [];

    // Reset D3 simulation state
    if (state.simulation) {
        state.simulation.stop();
        state.simulation = null;
    }
    state.nodePositions = [];
    state.avatarData = [];
    state.linkElements = null;
    state.nodeElements = null;

    const feedMessages = document.getElementById('feedMessages');
    if(feedMessages) feedMessages.innerHTML = '';
} 