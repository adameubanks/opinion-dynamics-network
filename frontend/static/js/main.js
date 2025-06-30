import { createInitialState, initializeSimulationState } from './state.js';
import { fetchInitialState, sendMessage, resetSimulation, checkSimulationStatus, toggleSimulation } from './api.js';
import { connectWebSocket } from './websocket.js';
import { initializeD3Network, updateD3Network } from './network.js';
import { showSpeechBubble, setupSpeedSlider } from './ui-components.js';

document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        connectionChart: document.getElementById('connection-chart'),
        messageInput: document.getElementById('message-input'),
        sendButton: document.getElementById('send-button'),
        resetButton: document.getElementById('reset-button'),
        toggleSimulationButton: document.getElementById('toggle-simulation')
    };

    let state = createInitialState();
    let socket;

    function updateSimulationButton() {
        if (elements.toggleSimulationButton) {
            elements.toggleSimulationButton.textContent = state.simulationRunning ? 'Stop Simulation' : 'Start Simulation';
            elements.toggleSimulationButton.classList.remove('simulation-start', 'simulation-stop');
            
            if (state.simulationRunning) {
                elements.toggleSimulationButton.classList.add('simulation-stop');
            } else {
                elements.toggleSimulationButton.classList.add('simulation-start');
            }
        }
    }

    function handleWebSocketMessage(message) {
        if (message.type === 'opinion_update') {
            state.currentOpinions = message.data;
            if (message.color_scaling_params) state.colorScalingParams = message.color_scaling_params;
            if (message.adjacency_matrix) state.currentAdjacencyMatrix = message.adjacency_matrix;
            if (message.edge_weights) state.currentEdgeWeights = message.edge_weights;
            if (state.currentOpinions && state.currentOpinions.length > 0) {
                if (state.currentAdjacencyMatrix && state.currentAdjacencyMatrix.length > 0) {
                    updateD3Network(state.currentOpinions, state.currentAdjacencyMatrix, state.currentEdgeWeights, state);
                }
            }
        } else if (message.type === 'new_post') {
            console.log(`Model Result: ${message.data.sender_name} | Opinion: [${message.data.opinion_vector}] | Post: "${message.data.message}" | Analyzed: [${message.data.analyzed_opinion || 'N/A'}]`);
            addFeedMessage(message.data);
        } else if (message.type === 'initial_state_full' || message.type === 'reset_complete') {
            initializeSimulationState(message.data, state);
            if (state.currentAdjacencyMatrix && state.currentAdjacencyMatrix.length > 0) {
                initializeD3Network(state.currentOpinions, state.currentAdjacencyMatrix, state.agentNames, state.opinionAxes, state.currentEdgeWeights, state, elements);
            }
        } else if (message.type === 'system_message') {
            console.log("System:", message.data.message);
        }
    }

    function addFeedMessage(postData, retryCount = 0) {
        const { sender_index, message } = postData;

        if (sender_index === -1) return;

        if (!state.nodeElements || !state.nodeElements.nodes || state.nodeElements.nodes().length === 0) {
            console.log(`Speech bubble: waiting for nodes to initialize. Retry ${retryCount + 1}/5.`);
            if (retryCount < 5) {
                setTimeout(() => addFeedMessage(postData, retryCount + 1), 300);
            }
            return;
        }

        const nodeElement = d3.select(state.nodeElements.nodes()[sender_index]);

        if (!nodeElement.empty()) {
            showSpeechBubble(nodeElement, message);
        } else {
            console.warn(`Speech bubble: Could not find node element for sender_index ${sender_index}.`);
        }
    }

    async function handleSendMessage() {
        const messageText = elements.messageInput.value.trim();
        if (messageText && socket && socket.readyState === WebSocket.OPEN) {
            elements.messageInput.value = '';

            try {
                await sendMessage(messageText);
            } catch (error) {
                console.error("Failed to send message:", error);
            }
        }
    }

    async function handleResetSimulation() {
        try {
            await resetSimulation();
            state.simulationRunning = false;
            updateSimulationButton();
        } catch (error) {
            console.error("Failed to reset simulation:", error);
        }
    }

    async function handleToggleSimulation() {
        try {
            const result = await toggleSimulation(state.simulationRunning);
            state.simulationRunning = (result.status === 'started');
            updateSimulationButton();
        } catch (error) {
            console.error("Failed to toggle simulation:", error);
        }
    }

    async function initialize() {
        try {
            const initialState = await fetchInitialState();
            initializeSimulationState(initialState, state);
            if (initialState.adjacency_matrix && initialState.adjacency_matrix.length > 0) {
                state.currentAdjacencyMatrix = initialState.adjacency_matrix;
                initializeD3Network(state.currentOpinions, state.currentAdjacencyMatrix, state.agentNames, state.opinionAxes, state.currentEdgeWeights, state, elements);
            }
        } catch (error) {
            console.error("Failed to fetch initial state:", error);
            if (elements.connectionChart) elements.connectionChart.innerHTML = "<p>Error loading connection data.</p>";
        }

        try {
            const status = await checkSimulationStatus();
            state.simulationRunning = status.running;
            updateSimulationButton();
        } catch (error) {
            console.error("Failed to check simulation status:", error);
        }

        socket = connectWebSocket(handleWebSocketMessage);
    }

    // Event listeners
    if (elements.sendButton) {
        elements.sendButton.addEventListener('click', handleSendMessage);
    }
    if (elements.messageInput) {
        elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSendMessage();
            }
        });
    }
    if (elements.resetButton) {
        elements.resetButton.addEventListener('click', handleResetSimulation);
    }
    if (elements.toggleSimulationButton) {
        elements.toggleSimulationButton.addEventListener('click', handleToggleSimulation);
    }

    setupSpeedSlider();
    initialize();
}); 