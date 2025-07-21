import { createInitialState } from './state.js';
import { Network } from './network.js';
import { analyzePostWithChatGPT } from './api.js';
import { getPostForOpinion } from './pregenerated-posts.js';
import { initializeD3Network, updateD3Network } from './network.js';
import { showSpeechBubble} from './ui-components.js';

document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        connectionChart: document.getElementById('connection-chart'),
        messageInput: document.getElementById('message-input'),
        sendButton: document.getElementById('send-button'),
        resetButton: document.getElementById('reset-button'),
        toggleSimulationButton: document.getElementById('toggle-simulation')
    };

    // Simulation parameters (matching Python backend exactly)
    const nAgents = 21;
    const alphaFilter = 0.9;
    const userAgents = [[0.5]];
    const userAlpha = 0.95;
    const userConnections = 5;
    const minConnections = 2;
    const maxOpinionChange = 0.1;

    let network = new Network(nAgents, null, alphaFilter, userAgents, userAlpha, userConnections, minConnections, null, maxOpinionChange);
    let state = createInitialState();
    
    // Properly initialize state with network data
    state.simulationRunning = false;
    state.currentOpinions = network.X.map(row => [...row]);
    state.previousOpinions = [];
    state.currentAdjacencyMatrix = network.A.map(row => [...row]);
    state.currentEdgeWeights = network.edge_weights.map(row => [...row]);
    state.agentNames = Array.from({ length: nAgents }, (_, i) => `Agent ${i}`);
    state.userAgentIndex = 0;
    state.nAgents = nAgents;
    state.userHasPosted = false;
    state.opinionAxes = [
        {
            'name': 'Pineapple on Pizza',
            'pro': 'Pineapple is a great topping that enhances the flavor of a pizza.',
            'con': 'Pineapple does not belong on pizza; it ruins the flavor.'
        }
    ];
    state.colorScalingParams = { x_min: 0, x_max: 1 };

    // Post generation timing
    let lastPostTime = 0;
    let lastSimulationUpdate = 0;
    const simulationSpeed = 5000; // Fixed: 5 seconds between updates (matching Python backend)
    const postInterval = 5000; // 5 seconds between posts (matching Python backend)

    function updateSimulationButton() {
        if (elements.toggleSimulationButton) {
            const icon = elements.toggleSimulationButton.querySelector('i');
            elements.toggleSimulationButton.classList.remove('simulation-start', 'simulation-stop');
            if (state.simulationRunning) {
                icon.classList.remove('fa-play');
                icon.classList.add('fa-pause');
                elements.toggleSimulationButton.classList.add('simulation-stop');
            } else {
                icon.classList.remove('fa-pause');
                icon.classList.add('fa-play');
                elements.toggleSimulationButton.classList.add('simulation-start');
            }
        }
    }



    function addFeedMessage(postData) {
        const { sender_index, message } = postData;
        if (sender_index === -1) return;
        if (!state.nodeElements || !state.nodeElements.nodes || state.nodeElements.nodes().length === 0) return;
        const nodeElement = d3.select(state.nodeElements.nodes()[sender_index]);
        if (!nodeElement.empty()) {
            showSpeechBubble(nodeElement, message);
        }
    }



    async function sendSimulationMessage(messageText) {
        if (!messageText) return;
        // Show loading state if sendButton exists
        if (elements.sendButton) {
            elements.sendButton.textContent = 'Analyzing...';
            elements.sendButton.disabled = true;
        }
        try {
            // Analyze the post using ChatGPT
            let analyzedOpinion;
            try {
                analyzedOpinion = await analyzePostWithChatGPT(messageText, state.opinionAxes);
                console.log(`Analyzed opinion: [${analyzedOpinion}]`);
            } catch (e) {
                console.error('ChatGPT analysis failed:', e);
                analyzedOpinion = userAgents[0]; // Use default opinion like Python backend
                alert('Error analyzing your post, using default opinion.');
            }
            // Add user opinion to the network
            if (Array.isArray(analyzedOpinion)) {
                network.add_user_opinion(analyzedOpinion, state.userAgentIndex);
            } else {
                const current_X_state = network.get_state();
                network.add_user_opinion(current_X_state.X[state.userAgentIndex], state.userAgentIndex);
            }
            state.userHasPosted = true;
            // Store previous opinions to ensure full update
            state.previousOpinions = state.currentOpinions.map(row => [...row]);
            // Update the network
            network.update_network(true);
            state.currentOpinions = network.X.map(row => [...row]);
            state.currentAdjacencyMatrix = network.A.map(row => [...row]);
            state.currentEdgeWeights = network.edge_weights.map(row => [...row]);
            updateD3Network(state.currentOpinions, state.currentAdjacencyMatrix, state.currentEdgeWeights, state);
            // Add the message to the feed
            addFeedMessage({ sender_index: state.userAgentIndex, message: messageText });
        } catch (error) {
            console.error('Error processing message:', error);
            alert('An error occurred while processing your message.');
        } finally {
            // Restore button state if sendButton exists
            if (elements.sendButton) {
                elements.sendButton.textContent = 'Send';
                elements.sendButton.disabled = false;
            }
        }
    }

    async function handleSendMessage() {
        const messageText = elements.messageInput ? elements.messageInput.value.trim() : '';
        if (!messageText) return;
        if (elements.messageInput) elements.messageInput.value = '';
        await sendSimulationMessage(messageText);
    }

    // Expose the function globally for console use
    window.sendSimulationMessage = sendSimulationMessage;
    window.toggleSimulation = handleToggleSimulation;
    window.resetSimulation = handleResetSimulation;
    window.playSimulation = function() {
        if (!state.simulationRunning) {
            state.simulationRunning = true;
            updateSimulationButton();
            console.log('Simulation started');
        }
    };
    window.pauseSimulation = function() {
        if (state.simulationRunning) {
            state.simulationRunning = false;
            updateSimulationButton();
            console.log('Simulation paused');
        }
    };

    function handleResetSimulation() {
        try {
            network = new Network(nAgents, null, alphaFilter, userAgents, userAlpha, userConnections, minConnections, null, maxOpinionChange);
            state.simulationRunning = false;
            state.currentOpinions = network.X.map(row => [...row]);
            state.previousOpinions = [];
            state.currentAdjacencyMatrix = network.A.map(row => [...row]);
            state.currentEdgeWeights = network.edge_weights.map(row => [...row]);
            state.userHasPosted = false;
            updateD3Network(state.currentOpinions, state.currentAdjacencyMatrix, state.currentEdgeWeights, state);
            updateSimulationButton();
            lastPostTime = 0;
            lastSimulationUpdate = 0;
            console.log('Simulation reset successfully');
        } catch (error) {
            console.error('Error resetting simulation:', error);
            alert('Failed to reset simulation. Please refresh the page.');
        }
    }

    function handleToggleSimulation() {
        state.simulationRunning = !state.simulationRunning;
        updateSimulationButton();
        console.log(`Simulation ${state.simulationRunning ? 'started' : 'stopped'}`);
    }

    function initialize() {
        // Ensure all data is properly set before initializing D3
        console.log('Initializing with:', {
            opinions: state.currentOpinions.length,
            adjacency: state.currentAdjacencyMatrix.length,
            agents: state.nAgents,
            axes: state.opinionAxes
        });
        
        try {
            initializeD3Network(state.currentOpinions, state.currentAdjacencyMatrix, state.agentNames, state.opinionAxes, state.currentEdgeWeights, state, elements);
            updateSimulationButton();
            console.log('D3 network initialized successfully');
        } catch (error) {
            console.error('Error initializing D3 network:', error);
            if (elements.connectionChart) {
                elements.connectionChart.innerHTML = "<p>Error initializing visualization. Please refresh the page.</p>";
            }
        }
    }

    // Event listeners
    if (elements.sendButton) {
        elements.sendButton.addEventListener('click', handleSendMessage);
    }
    if (elements.messageInput) {
        elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
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


    initialize();

    state.simulationRunning = true;

    // Simulation loop with speed control and automatic post generation
    function simulationLoop() {
        const currentTime = Date.now();
        
        if (state.simulationRunning) {
            // Update simulation based on speed setting
            if (currentTime - lastSimulationUpdate > simulationSpeed) {
                try {
                    // Store previous opinions before updating
                    state.previousOpinions = state.currentOpinions.map(row => [...row]);
                    
                    network.update_network(state.userHasPosted);
                    state.currentOpinions = network.X.map(row => [...row]);
                    state.currentAdjacencyMatrix = network.A.map(row => [...row]);
                    state.currentEdgeWeights = network.edge_weights.map(row => [...row]);
                    updateD3Network(state.currentOpinions, state.currentAdjacencyMatrix, state.currentEdgeWeights, state);
                    lastSimulationUpdate = currentTime;
                } catch (error) {
                    console.error('Error updating simulation:', error);
                }
            }
            
            // Generate random posts periodically (matching Python backend logic)
            if (currentTime - lastPostTime > postInterval) {
                try {
                    // Pick a random agent (excluding user agent) like Python backend
                    const agentIndicesAll = Array.from({ length: nAgents }, (_, i) => i);
                    const eligiblePosters = agentIndicesAll.filter(idx => idx !== 0);
                    
                    if (eligiblePosters.length > 0) {
                        const agentIndex = eligiblePosters[Math.floor(Math.random() * eligiblePosters.length)];
                        const opinion = state.currentOpinions[agentIndex][0];
                        
                        // Get a post based on the agent's opinion
                        const post = getPostForOpinion(opinion);
                        
                        // Set agent opinion using analyzed opinion from post
                        if (post.sentiment) {
                            network.set_agent_opinion(agentIndex, post.sentiment);
                        }
                        
                        // Update network with proper include_user_opinions parameter
                        network.update_network(state.userHasPosted);
                        
                        // Update state after post generation
                        state.currentOpinions = network.X.map(row => [...row]);
                        state.currentAdjacencyMatrix = network.A.map(row => [...row]);
                        state.currentEdgeWeights = network.edge_weights.map(row => [...row]);
                        updateD3Network(state.currentOpinions, state.currentAdjacencyMatrix, state.currentEdgeWeights, state);
                        
                        // Add the post to the feed
                        addFeedMessage({ 
                            sender_index: agentIndex, 
                            message: post.text 
                        });
                        
                        console.log(`Agent ${agentIndex} posted: "${post.text}" (opinion: ${opinion.toFixed(3)})`);
                    }
                    lastPostTime = currentTime;
                } catch (error) {
                    console.error('Error generating post:', error);
                }
            }
        }
        
        requestAnimationFrame(simulationLoop);
    }
    simulationLoop();
}); 