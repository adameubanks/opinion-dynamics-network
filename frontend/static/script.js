document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        connectionChart: document.getElementById('connection-chart'),
        feedMessages: document.getElementById('feed'),
        messageInput: document.getElementById('message-input'),
        sendButton: document.getElementById('send-button'),
        resetButton: document.getElementById('reset-button'),
        toggleSimulationButton: document.getElementById('toggle-simulation'),
        strategicCheckbox: document.getElementById('strategic-agents-checkbox')
    };

    let state = {
        currentOpinions: [],
        agentNames: [],
        opinionAxes: [],
        nAgents: 0,
        includeStrategicAgents: true,
        strategicAgentCount: 0,
        userAgentIndex: 0,
        colorScalingParams: {},
        currentAdjacencyMatrix: [],
        simulationRunning: false,
        nodePositions: [],
        simulation: null,
        avatarData: [],
        linkElements: null,
        nodeElements: null,
        currentEdgeWeights: []
    };

    let socket;

    function updateSimulationButton() {
        if (elements.toggleSimulationButton) {
            elements.toggleSimulationButton.textContent = state.simulationRunning ? 'Stop Simulation' : 'Start Simulation';
            
            // Remove existing state classes
            elements.toggleSimulationButton.classList.remove('simulation-start', 'simulation-stop');
            
            // Add appropriate class based on current state
            if (state.simulationRunning) {
                elements.toggleSimulationButton.classList.add('simulation-stop');
            } else {
                elements.toggleSimulationButton.classList.add('simulation-start');
            }
        }
    }

    async function checkSimulationStatus() {
        try {
            const response = await fetch('/api/simulation_status');
            if (response.ok) {
                const status = await response.json();
                state.simulationRunning = status.running;
                updateSimulationButton();
            }
        } catch (error) {
            console.error("Failed to check simulation status:", error);
        }
    }

    async function toggleSimulation() {
        const action = state.simulationRunning ? 'stop' : 'start';
        try {
            const response = await fetch('/api/control_simulation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: action }),
            });
            if (response.ok) {
                const result = await response.json();
                state.simulationRunning = (result.status === 'started');
                updateSimulationButton();
                addFeedMessage({ 
                    sender_name: "System", 
                    sender_index: -1, 
                    message: result.message, 
                    opinion_vector: [0.5] 
                });
            } else {
                const errorData = await response.json().catch(() => ({detail: "Toggle failed"}));
                addFeedMessage({ 
                    sender_name: "System", 
                    sender_index: -1, 
                    message: `Error: ${errorData.detail}`, 
                    opinion_vector: [0.5] 
                });
            }
        } catch (error) {
            addFeedMessage({ 
                sender_name: "System", 
                sender_index: -1, 
                message: "Network error controlling simulation.", 
                opinion_vector: [0.5] 
            });
        }
    }

    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/ws/simulation_updates`);

        socket.onopen = () => console.log("WebSocket connection established.");

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'opinion_update') {
                state.currentOpinions = message.data;
                if (message.color_scaling_params) state.colorScalingParams = message.color_scaling_params;
                if (message.adjacency_matrix) state.currentAdjacencyMatrix = message.adjacency_matrix;
                if (message.edge_weights) state.currentEdgeWeights = message.edge_weights;
                if (state.currentOpinions && state.currentOpinions.length > 0) {
                    if (state.currentAdjacencyMatrix && state.currentAdjacencyMatrix.length > 0) {
                        updateConnectionChart(state.currentOpinions, state.currentAdjacencyMatrix, state.currentEdgeWeights);
                    }
                }
            } else if (message.type === 'new_post') {
                addFeedMessage(message.data);
            } else if (message.type === 'initial_state_full' || message.type === 'reset_complete') {
                initializeSimulationState(message.data);
                if (state.currentAdjacencyMatrix && state.currentAdjacencyMatrix.length > 0) {
                    initializeConnectionChart(state.currentOpinions, state.currentAdjacencyMatrix, state.agentNames, state.opinionAxes, state.currentEdgeWeights);
                }
            } else if (message.type === 'system_message') {
                addFeedMessage({ 
                    sender_name: "System", 
                    sender_index: -1,
                    message: message.data.message, 
                    opinion_vector: [0.5]
                });
            }
        };

        socket.onclose = () => {
            console.log("WebSocket connection closed. Attempting to reconnect...");
            setTimeout(connectWebSocket, 5000);
        };

        socket.onerror = (error) => console.error("WebSocket error:", error);
    }

    async function fetchInitialState() {
        try {
            const response = await fetch('/api/initial_state');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const initialState = await response.json();
            initializeSimulationState(initialState);
            if (initialState.adjacency_matrix && initialState.adjacency_matrix.length > 0) {
                state.currentAdjacencyMatrix = initialState.adjacency_matrix;
                initializeConnectionChart(state.currentOpinions, state.currentAdjacencyMatrix, state.agentNames, state.opinionAxes, state.currentEdgeWeights);
            }
        } catch (error) {
            console.error("Failed to fetch initial state:", error);
            if (elements.connectionChart) elements.connectionChart.innerHTML = "<p>Error loading connection data.</p>";
        }
    }
    
    function initializeSimulationState(stateData) {
        state.currentOpinions = stateData.opinions || [];
        state.agentNames = stateData.agent_names || [];
        state.opinionAxes = stateData.opinion_axes || [{name: 'X-Axis', pro:'', con:''}];
        state.nAgents = stateData.n_agents || 0;
        state.includeStrategicAgents = stateData.include_strategic_agents !== undefined ? stateData.include_strategic_agents : true;
        state.strategicAgentCount = stateData.strategic_agent_count || 0;
        state.userAgentIndex = stateData.user_agent_index !== undefined ? stateData.user_agent_index : 0;
        state.colorScalingParams = stateData.color_scaling_params || {x_min:0, x_max:1};
        if(elements.strategicCheckbox) elements.strategicCheckbox.checked = state.includeStrategicAgents;
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

        if(elements.feedMessages) elements.feedMessages.innerHTML = '';
    }

    function getPastelColor(agentIndex, opinionVector) {
        const pastelColors = ['#FFB3BA', '#BAFFC9', '#BAE1FF', '#FFFFBA', '#E1BAFF', '#FFDFBA', '#B3FFBA', '#BAD4FF', '#FFE1BA', '#D4BAFF'];
        
        if (agentIndex === -1) return '#6c757d';
        if (agentIndex === state.userAgentIndex) return '#F0E68C';
        if (state.includeStrategicAgents && agentIndex >= state.nAgents - state.strategicAgentCount) return '#A9A9A9';
        
        return pastelColors[agentIndex % pastelColors.length];
    }

    function generateAvatarData(agentCount) {
        const hairColors = ['#8B4513', '#FFD700', '#000000', '#FF6347', '#9370DB'];
        const skinColors = ['#FDBCB4', '#F1C27D', '#E0AC69', '#C68642', '#8D5524'];
        const expressions = ['happy', 'neutral', 'concerned', 'excited', 'thoughtful'];
        const accessories = ['none', 'glasses', 'hat', 'earrings', 'necklace'];
        
        const avatars = [];
        for (let i = 0; i < agentCount; i++) {
            avatars.push({
                hairColor: hairColors[i % hairColors.length],
                skinColor: skinColors[(Math.floor(i / hairColors.length)) % skinColors.length],
                expression: expressions[Math.floor(Math.random() * expressions.length)],
                accessory: accessories[Math.floor(Math.random() * accessories.length)]
            });
        }
        return avatars;
    }

    function getShirtColorFromOpinion(opinion) {
        // Pineapple haters (red shirts) - opinion < 0.45
        if (opinion < 0.45) return '#FF6B6B'; // Red for haters
        // Pineapple lovers (green shirts) - opinion > 0.55  
        if (opinion > 0.55) return '#4ECDC4'; // Teal/green for lovers
        // Neutral/undecided (gray shirts) - opinion 0.45-0.55
        return '#95A5A6'; // Gray for neutral
    }

    function drawAvatar(selection, avatarConfig, agentIndex, opinion = 0.5) {
        const avatarGroup = selection.append('g')
            .attr('class', 'avatar')
            .attr('transform', 'translate(-20, -20)');

        // Head (circle)
        avatarGroup.append('circle')
            .attr('class', 'avatar-head')
            .attr('cx', 20)
            .attr('cy', 15)
            .attr('r', 12)
            .attr('fill', avatarConfig.skinColor)
            .attr('stroke', '#333')
            .attr('stroke-width', 1);

        // Eyes
        avatarGroup.append('circle')
            .attr('cx', 16)
            .attr('cy', 13)
            .attr('r', 1.5)
            .attr('fill', '#000');

        avatarGroup.append('circle')
            .attr('cx', 24)
            .attr('cy', 13)
            .attr('r', 1.5)
            .attr('fill', '#000');

        // Hair
        avatarGroup.append('path')
            .attr('d', 'M 8 2 Q 20 0 32 2 Q 32 8 20 10 Q 8 8 8 2')
            .attr('fill', avatarConfig.hairColor)
            .attr('stroke', '#333')
            .attr('stroke-width', 1);

        // Mouth based on expression
        let mouthPath;
        switch(avatarConfig.expression) {
            case 'happy':
                mouthPath = 'M 16 18 Q 20 22 24 18';
                break;
            case 'concerned':
                mouthPath = 'M 16 20 Q 20 16 24 20';
                break;
            case 'excited':
                mouthPath = 'M 16 17 Q 20 23 24 17';
                break;
            default:
                mouthPath = 'M 16 19 L 24 19';
        }

        avatarGroup.append('path')
            .attr('class', 'mouth')
            .attr('d', mouthPath)
            .attr('stroke', '#333')
            .attr('stroke-width', 1.5)
            .attr('fill', 'none');

        // Body (opinion-based shirt color)
        avatarGroup.append('rect')
            .attr('class', 'avatar-body')
            .attr('x', 12)
            .attr('y', 25)
            .attr('width', 16)
            .attr('height', 15)
            .attr('fill', getShirtColorFromOpinion(opinion))
            .attr('stroke', '#333')
            .attr('stroke-width', 1)
            .attr('rx', 2);

        // Accessories
        if (avatarConfig.accessory === 'glasses') {
            avatarGroup.append('rect')
                .attr('x', 14)
                .attr('y', 11)
                .attr('width', 6)
                .attr('height', 4)
                .attr('fill', 'none')
                .attr('stroke', '#333')
                .attr('stroke-width', 1);
            
            avatarGroup.append('rect')
                .attr('x', 20)
                .attr('y', 11)
                .attr('width', 6)
                .attr('height', 4)
                .attr('fill', 'none')
                .attr('stroke', '#333')
                .attr('stroke-width', 1);
        }

        // Add "YOU" label for user's avatar
        if (agentIndex === state.userAgentIndex) {
            avatarGroup.append('text')
                .attr('class', 'user-label')
                .attr('x', 20)
                .attr('y', 50)
                .attr('text-anchor', 'middle')
                .attr('font-family', 'Arial, sans-serif')
                .attr('font-size', '10px')
                .attr('font-weight', 'bold')
                .attr('fill', '#FFD700')
                .attr('stroke', '#333')
                .attr('stroke-width', 0.5)
                .text('YOU');
        }

        return avatarGroup;
    }

    function createD3Nodes(opinions, agentNames) {
        return opinions.map((opinion, i) => ({
            id: i,
            name: agentNames[i] || `Agent ${i}`,
            opinion: opinion[0],
            x: 100 + (600 * opinion[0]) + (Math.random() - 0.5) * 50,
            y: 250 + (Math.random() - 0.5) * 200,
            isUser: i === state.userAgentIndex,
            isStrategic: state.includeStrategicAgents && i >= state.nAgents - state.strategicAgentCount
        }));
    }

    function createD3Links(adjMatrix, edgeWeights) {
        const links = [];
        for (let i = 0; i < adjMatrix.length; i++) {
            for (let j = i + 1; j < adjMatrix[i].length; j++) {
                if (adjMatrix[i][j] === 1) {
                    const weight = edgeWeights && edgeWeights[i] && edgeWeights[i][j] ? edgeWeights[i][j] : 0.5;
                    links.push({
                        source: i,
                        target: j,
                        weight: weight,
                        distance: Math.max(30, 200 * (1 - weight)), // Stronger variation: closer opinions = much shorter distance
                        opacity: Math.max(0.2, weight), // Higher weight = more visible
                        thickness: Math.max(0.5, weight * 5) // Higher weight = much thicker line
                    });
                }
            }
        }
        return links;
    }

    function createD3NetworkElements() {
        const container = d3.select('#connection-chart');
        container.selectAll('*').remove();
        
        const svg = container.append('svg')
            .attr('class', 'd3-network-container')
            .attr('width', '100%')
            .attr('height', '100%');
        
        const width = container.node().getBoundingClientRect().width;
        const height = container.node().getBoundingClientRect().height;
        
        svg.attr('viewBox', `0 0 ${width} ${height}`);
        
        // Create groups for links and nodes
        const linkGroup = svg.append('g').attr('class', 'links');
        const nodeGroup = svg.append('g').attr('class', 'nodes');
        
        return { svg, linkGroup, nodeGroup, width, height };
    }

    function initializeD3Network(opinions, adjMatrix, agentNamesArr, opinionAxesInfo, edgeWeights) {
        if (!elements.connectionChart || !opinions || opinions.length === 0 || !adjMatrix || adjMatrix.length === 0) {
            if(elements.connectionChart) elements.connectionChart.innerHTML = "<p>Waiting for connection data...</p>";
            return;
        }

        // Generate avatar data for all agents
        state.avatarData = generateAvatarData(opinions.length);
        
        // Create D3 network elements
        const { svg, linkGroup, nodeGroup, width, height } = createD3NetworkElements();
        
        // Create nodes and links data
        const nodes = createD3Nodes(opinions, agentNamesArr);
        const links = createD3Links(adjMatrix, edgeWeights);
        
        console.log(`Initializing network: ${nodes.length} agents, ${links.length} initial connections`);
        console.log(`Initial connections:`, links.map(l => `${l.source}-${l.target} (weight: ${l.weight.toFixed(3)})`));
        
        // Setup force simulation with extreme polarization - NO CENTER FORCE
        state.simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.distance).strength(d => d.weight * 0.1)) // Weaker links
            .force("charge", d3.forceManyBody().strength(-300))
            .force("collision", d3.forceCollide().radius(15)) // Smaller collision radius
            .force("opinion_cluster", d3.forceX(d => width * 0.05 + (width * 0.9 * d.opinion)).strength(2.5)) // Much stronger
            .force("influence", d3.forceX().strength(0));

        // Create link elements
        const linkElements = linkGroup.selectAll('.network-edge')
            .data(links)
            .enter()
            .append('line')
            .attr('class', 'network-edge')
            .attr('stroke-width', d => d.thickness)
            .attr('stroke-opacity', d => d.opacity)
            .attr('stroke', '#999');

        // Create node elements
        const nodeElements = nodeGroup.selectAll('.network-node')
            .data(nodes)
            .enter()
            .append('g')
            .attr('class', d => {
                let classes = 'network-node';
                if (d.isUser) classes += ' user-node';
                if (d.isStrategic) classes += ' strategic-node';
                return classes;
            });

        // Draw avatars for each node
        nodeElements.each(function(d, i) {
            drawAvatar(d3.select(this), state.avatarData[i], i, d.opinion);
        });

        // Update positions on simulation tick
        state.simulation.on("tick", () => {
            linkElements
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            nodeElements
                .attr('transform', d => `translate(${d.x}, ${d.y})`);
        });

        // Store elements for updates
        state.linkElements = linkElements;
        state.nodeElements = nodeElements;
        state.nodePositions = nodes;
    }

    function initializeConnectionChart(opinions, adjMatrix, agentNamesArr, opinionAxesInfo, edgeWeights) {
        // Replace with D3 implementation
        return initializeD3Network(opinions, adjMatrix, agentNamesArr, opinionAxesInfo, edgeWeights);
    }

    function updateD3Network(opinions, adjMatrix, edgeWeights) {
        if (!elements.connectionChart || !opinions || opinions.length === 0 || !adjMatrix || adjMatrix.length === 0 || !state.simulation) return;
        
        // Update node data with new opinions
        state.nodePositions.forEach((node, i) => {
            if (opinions[i]) {
                node.opinion = opinions[i][0];
            }
        });
        
        // Update links with new edge weights
        const newLinks = createD3Links(adjMatrix, edgeWeights);
        console.log(`Network update: ${newLinks.length} connections, avg weight: ${newLinks.length > 0 ? (newLinks.reduce((sum, link) => sum + link.weight, 0) / newLinks.length).toFixed(3) : 0}`);
        
        // Update force simulation with new data
        state.simulation.nodes(state.nodePositions);
        state.simulation.force("link").links(newLinks).distance(d => d.distance).strength(d => d.weight * 0.1); // Weaker links
        
        // Restart simulation much more aggressively for dramatic changes
        state.simulation.alpha(1.5).restart();
        
        // Immediately boost polarization forces during updates
        state.simulation.force('opinion_cluster').strength(3.0); // Even stronger during updates
        
        setTimeout(() => {
            if (state.simulation) {
                state.simulation.force('opinion_cluster').strength(2.5); // Back to strong default
                state.simulation.alpha(1.0).restart();
            }
        }, 200);
        
        // Update visual elements
        if (state.linkElements && state.nodeElements) {
            // Update links
            const linkUpdate = state.linkElements.data(newLinks);
            linkUpdate.exit().remove();
            const linkEnter = linkUpdate.enter().append('line')
                .attr('class', 'network-edge')
                .attr('stroke', '#999');
            state.linkElements = linkEnter.merge(linkUpdate)
                .attr('stroke-width', d => d.thickness)
                .attr('stroke-opacity', d => d.opacity);
            
            // Update avatars with new colors and expressions based on opinions
            state.nodeElements.each(function(d, i) {
                const avatar = d3.select(this).select('.avatar');
                if (avatar.node()) {
                    // Update shirt color based on new opinion
                    avatar.select('.avatar-body')
                        .transition()
                        .duration(500)
                        .attr('fill', getShirtColorFromOpinion(d.opinion));
                    
                    // Update avatar expression based on opinion
                    const newExpression = d.opinion < 0.3 ? 'concerned' : 
                                        d.opinion > 0.7 ? 'excited' : 'neutral';
                    
                    // Update mouth path
                    let mouthPath;
                    switch(newExpression) {
                        case 'happy':
                            mouthPath = 'M 16 18 Q 20 22 24 18';
                            break;
                        case 'concerned':
                            mouthPath = 'M 16 20 Q 20 16 24 20';
                            break;
                        case 'excited':
                            mouthPath = 'M 16 17 Q 20 23 24 17';
                            break;
                        default:
                            mouthPath = 'M 16 19 L 24 19';
                    }
                    
                    avatar.select('.mouth')
                        .transition()
                        .duration(300)
                        .attr('d', mouthPath);
                }
            });
        }
    }

    function updateConnectionChart(opinions, adjMatrix, edgeWeights) {
        // Replace with D3 implementation
        return updateD3Network(opinions, adjMatrix, edgeWeights);
    }

    function addFeedMessage(postData) {
        if (!elements.feedMessages) return;
        const { sender_name, sender_index, message, opinion_vector } = postData;
        const postDiv = document.createElement('div');
        postDiv.classList.add('feed-post');
        const senderSpan = document.createElement('span');
        senderSpan.classList.add('sender-name');
        senderSpan.textContent = sender_name + ": ";
        const messageSpan = document.createElement('span');
        messageSpan.textContent = message;
        postDiv.appendChild(senderSpan);
        postDiv.appendChild(messageSpan);
        const borderColor = getPastelColor(sender_index, opinion_vector || (state.currentOpinions[sender_index] ? state.currentOpinions[sender_index] : [0.5]));
        postDiv.style.borderLeft = `4px solid ${borderColor}`;
        elements.feedMessages.appendChild(postDiv);
        elements.feedMessages.scrollTop = elements.feedMessages.scrollHeight;
        
        // Apply connection-based influence forces for non-system posts
        if (sender_index >= 0 && sender_name !== "System" && state.currentAdjacencyMatrix && state.currentOpinions) {
            // Get message opinion from post data
            let messageOpinion = 0.5;
            if (opinion_vector && opinion_vector.length > 0) {
                messageOpinion = opinion_vector[0];
            }
            
            // Get poster's current opinion
            let posterOpinion = 0.5;
            if (state.currentOpinions[sender_index]) {
                posterOpinion = state.currentOpinions[sender_index][0];
            }
        }
    }

    async function sendMessage() {
        const messageText = elements.messageInput.value.trim();
        if (messageText && socket && socket.readyState === WebSocket.OPEN) {
            const userMessage = {
                sender_name: state.agentNames[state.userAgentIndex] || "User",
                sender_index: state.userAgentIndex,
                message: messageText,
                opinion_vector: state.currentOpinions[state.userAgentIndex] || [0.5]
            };
            addFeedMessage(userMessage);
            elements.messageInput.value = '';
            
            try {
                const response = await fetch('/api/send_message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: messageText }),
                });
                if (response.ok) {
                    const result = await response.json();
                    
                    // Use analyzed opinion from backend for logging
                    let analyzedOpinion = 0.5;
                    if (result.analyzed_opinion && result.analyzed_opinion.length > 0) {
                        analyzedOpinion = result.analyzed_opinion[0];
                    }
                    
                    // Get user's current opinion
                    let userOpinion = 0.5;
                    if (state.currentOpinions[state.userAgentIndex]) {
                        userOpinion = state.currentOpinions[state.userAgentIndex][0];
                    }
                } else {
                    const errorData = await response.json().catch(() => ({detail: "Send failed"}));
                    addFeedMessage({ sender_name: "System", sender_index: -1, message: `Error sending: ${errorData.detail}`, opinion_vector: [0.5]});
                }
            } catch (error) {
                addFeedMessage({ sender_name: "System", sender_index: -1, message: "Network error sending message.", opinion_vector: [0.5]});
            }
        }
    }

    async function resetSimulation() {
        const newStrategicChoice = elements.strategicCheckbox ? elements.strategicCheckbox.checked : state.includeStrategicAgents;
        try {
            const response = await fetch('/api/reset_simulation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ include_strategic_agents: newStrategicChoice }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({detail: "Reset failed"}));
                throw new Error(`Reset failed: ${response.status} ${errorData.detail}`);
            }
            addFeedMessage({ sender_name: "System", sender_index: -1, message: "Simulation reset successfully", opinion_vector: [0.5] });
            state.simulationRunning = false;
            updateSimulationButton();
        } catch (error) {
            addFeedMessage({ sender_name: "System", sender_index: -1, message: `Reset error: ${error.message}`, opinion_vector: [0.5] });
        }
    }

    if (elements.sendButton) elements.sendButton.addEventListener('click', sendMessage);
    if (elements.messageInput) elements.messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
    if (elements.resetButton) elements.resetButton.addEventListener('click', resetSimulation);
    if (elements.toggleSimulationButton) {
        elements.toggleSimulationButton.addEventListener('click', toggleSimulation);
    }

    fetchInitialState();
    connectWebSocket();
    checkSimulationStatus();
});