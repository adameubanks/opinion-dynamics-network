document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        connectionChart: document.getElementById('connection-chart'),
        messageInput: document.getElementById('message-input'),
        sendButton: document.getElementById('send-button'),
        resetButton: document.getElementById('reset-button'),
        toggleSimulationButton: document.getElementById('toggle-simulation')
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
                console.log("System:", result.message);
            } else {
                const errorData = await response.json().catch(() => ({detail: "Toggle failed"}));
                console.error(`Error: ${errorData.detail}`);
            }
        } catch (error) {
            console.error("Network error controlling simulation.");
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
                        updateD3Network(state.currentOpinions, state.currentAdjacencyMatrix, state.currentEdgeWeights);
                    }
                }
            } else if (message.type === 'new_post') {
                addFeedMessage(message.data);
            } else if (message.type === 'initial_state_full' || message.type === 'reset_complete') {
                initializeSimulationState(message.data);
                if (state.currentAdjacencyMatrix && state.currentAdjacencyMatrix.length > 0) {
                    initializeD3Network(state.currentOpinions, state.currentAdjacencyMatrix, state.agentNames, state.opinionAxes, state.currentEdgeWeights);
                }
            } else if (message.type === 'system_message') {
                console.log("System:", message.data.message);
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
                initializeD3Network(state.currentOpinions, state.currentAdjacencyMatrix, state.agentNames, state.opinionAxes, state.currentEdgeWeights);
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

    function generateAvatarData(agentCount) {
        const hairColors = ['#8B4513', '#FFD700', '#000000', '#FF6347', '#9370DB'];
        const skinColors = ['#FDBCB4', '#F1C27D', '#E0AC69', '#C68642', '#8D5524'];
        const expressions = ['happy', 'neutral', 'concerned', 'excited', 'thoughtful'];
        
        const avatars = [];
        for (let i = 0; i < agentCount; i++) {
            avatars.push({
                hairColor: hairColors[i % hairColors.length],
                skinColor: skinColors[(Math.floor(i / hairColors.length)) % skinColors.length],
                expression: expressions[Math.floor(Math.random() * expressions.length)],
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
        const scaleFactor = 2.5; // Make avatars bigger
        const avatarGroup = selection.append('g')
            .attr('class', 'avatar')
            .attr('transform', `translate(-${20 * scaleFactor}, -${20 * scaleFactor})`);

        // Head (circle)
        avatarGroup.append('circle')
            .attr('class', 'avatar-head')
            .attr('cx', 20 * scaleFactor)
            .attr('cy', 15 * scaleFactor)
            .attr('r', 12 * scaleFactor)
            .attr('fill', avatarConfig.skinColor)
            .attr('stroke', '#333')
            .attr('stroke-width', 1 * scaleFactor);

        // Eyes
        avatarGroup.append('circle')
            .attr('cx', 16 * scaleFactor)
            .attr('cy', 13 * scaleFactor)
            .attr('r', 1.5 * scaleFactor)
            .attr('fill', '#000');

        avatarGroup.append('circle')
            .attr('cx', 24 * scaleFactor)
            .attr('cy', 13 * scaleFactor)
            .attr('r', 1.5 * scaleFactor)
            .attr('fill', '#000');

        // Hair
        avatarGroup.append('path')
            .attr('d', `M${8 * scaleFactor},${9 * scaleFactor} Q${20 * scaleFactor},${-5 * scaleFactor} ${32 * scaleFactor},${9 * scaleFactor} Z`)
            .attr('fill', avatarConfig.hairColor);

        // Body (simple rectangle)
        avatarGroup.append('rect')
            .attr('class', 'avatar-body')
            .attr('x', 10 * scaleFactor)
            .attr('y', 27 * scaleFactor)
            .attr('width', 20 * scaleFactor)
            .attr('height', 15 * scaleFactor)
            .attr('fill', getShirtColorFromOpinion(opinion))
            .attr('stroke', '#333')
            .attr('stroke-width', 1 * scaleFactor)
            .attr('rx', 3 * scaleFactor);

        // Mouth based on expression
        let mouthPath;
        switch(avatarConfig.expression) {
            case 'happy':
                mouthPath = `M ${16 * scaleFactor} ${18 * scaleFactor} Q ${20 * scaleFactor} ${22 * scaleFactor} ${24 * scaleFactor} ${18 * scaleFactor}`;
                break;
            case 'concerned':
                mouthPath = `M ${16 * scaleFactor} ${20 * scaleFactor} Q ${20 * scaleFactor} ${16 * scaleFactor} ${24 * scaleFactor} ${20 * scaleFactor}`;
                break;
            case 'excited':
                mouthPath = `M ${16 * scaleFactor} ${17 * scaleFactor} Q ${20 * scaleFactor} ${23 * scaleFactor} ${24 * scaleFactor} ${17 * scaleFactor}`;
                break;
            default: // neutral
                mouthPath = `M ${16 * scaleFactor} ${19 * scaleFactor} L ${24 * scaleFactor} ${19 * scaleFactor}`;
        }

        avatarGroup.append('path')
            .attr('class', 'mouth')
            .attr('d', mouthPath)
            .attr('stroke', '#333')
            .attr('stroke-width', 1 * scaleFactor)
            .attr('fill', 'none');
        
        // Add "YOU" label for user's avatar
        if (agentIndex === state.userAgentIndex) {
            avatarGroup.append('text')
                .attr('class', 'user-label')
                .attr('x', 20 * scaleFactor)
                .attr('y', 50 * scaleFactor) // Adjusted y offset
                .attr('text-anchor', 'middle')
                .attr('font-family', 'Arial, sans-serif')
                .attr('font-size', '25px')
                .attr('font-weight', 'bold')
                .attr('fill', '#FFD700')
                .attr('stroke', '#333')
                .attr('stroke-width', 0.5 * scaleFactor)
                .text('YOU');
        }

        return avatarGroup;
    }

    function createD3Nodes(opinions, agentNames, height) {
        return opinions.map((opinion, i) => ({
            id: i,
            name: agentNames[i] || `Agent ${i}`,
            opinion: opinion[0],
            x: 100 + (600 * opinion[0]) + (Math.random() - 0.5) * 50,
            y: (Math.random() < 0.5 ? Math.random() * 0.4 : 1 - Math.random() * 0.4) * height,
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
                        distance: Math.max(30, 200 * (1 - weight)),
                        opacity: Math.max(0.2, weight),
                        thickness: Math.max(1, weight * 15)
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
        state.avatarData = generateAvatarData(state.nAgents);
        
        // Create D3 network elements
        const { svg, linkGroup, nodeGroup, width, height } = createD3NetworkElements();
        
        // Create nodes and links data
        const nodes = createD3Nodes(opinions, agentNamesArr, height);
        nodes.forEach(d => {
            if (!d.x || !d.y) {
                d.x = Math.random() * width;
                d.y = Math.random() * height;
            }
            d.radius = 60; // Increased node radius for bigger avatars
        });
        const links = createD3Links(adjMatrix, edgeWeights);
        
        console.log(`Initializing network: ${nodes.length} agents, ${links.length} initial connections`);
        console.log(`Initial connections:`, links.map(l => `${l.source}-${l.target} (weight: ${l.weight.toFixed(3)})`));
        
        // Setup force simulation with extreme polarization and centering
        state.simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.distance).strength(d => d.weight * 0.1)) // Weaker links
            .force("charge", d3.forceManyBody().strength(-500))
            .force("collision", d3.forceCollide().radius(38)) // Smaller collision radius
            .force("opinion_cluster", d3.forceX(d => width * 0.05 + (width * 0.9 * d.opinion)).strength(2.5)) // Much stronger
            .force("influence", d3.forceX().strength(0))
            .force("y_centering", d3.forceY(height / 2).strength(0.1)); // Gentle vertical centering

        // Create link elements
        const linkElements = linkGroup.selectAll('.network-edge')
            .data(links)
            .enter()
            .append('line')
            .attr('class', 'network-edge')
            .attr('stroke-width', d => d.thickness)
            .attr('stroke-opacity', d => d.opacity)
            .attr('stroke', '#FFFFFF');

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

        // Ensure user node is on top
        nodeElements.filter('.user-node').raise();

        // Update positions on simulation tick
        state.simulation.on("tick", () => {
            const containerNode = d3.select('#connection-chart').node();
            if (!containerNode) return;
            const { width, height } = containerNode.getBoundingClientRect();

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
                .attr('stroke', '#FFFFFF');
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
                    const scaleFactor = 2.5; // Must match drawAvatar scaleFactor
                    let mouthPath;
                    switch(newExpression) {
                        case 'happy':
                            mouthPath = `M ${16 * scaleFactor} ${18 * scaleFactor} Q ${20 * scaleFactor} ${22 * scaleFactor} ${24 * scaleFactor} ${18 * scaleFactor}`;
                            break;
                        case 'concerned':
                            mouthPath = `M ${16 * scaleFactor} ${20 * scaleFactor} Q ${20 * scaleFactor} ${16 * scaleFactor} ${24 * scaleFactor} ${20 * scaleFactor}`;
                            break;
                        case 'excited':
                            mouthPath = `M ${16 * scaleFactor} ${17 * scaleFactor} Q ${20 * scaleFactor} ${23 * scaleFactor} ${24 * scaleFactor} ${17 * scaleFactor}`;
                            break;
                        default:
                            mouthPath = `M ${16 * scaleFactor} ${19 * scaleFactor} L ${24 * scaleFactor} ${19 * scaleFactor}`;
                    }
                    
                    avatar.select('.mouth')
                        .transition()
                        .duration(300)
                        .attr('d', mouthPath);
                }
            });
        }
    }

    function showSpeechBubble(nodeElement, message) {
        console.log('Showing bubble for:', message);
        nodeElement.raise();
        // Simple text wrapping (split by space)
        const words = message.split(' ');
        const maxCharsPerLine = 20;
        let lines = [];
        let currentLine = '';

        words.forEach(word => {
            if ((currentLine + ' ' + word).length > maxCharsPerLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = currentLine ? `${currentLine} ${word}` : word;
            }
        });
        lines.push(currentLine);

        const bubblePadding = 15;
        const lineHeight = 28;
        const bubbleHeight = lines.length * lineHeight + bubblePadding;
        const bubbleWidth = maxCharsPerLine * 11 + bubblePadding * 2; // Approximate width

        const bubbleGroup = nodeElement.append('g')
            .attr('class', 'speech-bubble')
            .attr('transform', `translate(${-bubbleWidth / 2}, ${-bubbleHeight - 75})`);

        const r = 8; // corner radius
        const tailHeight = 10;
        const tailWidth = 20;
        const pathData = `
            M ${r},0
            H ${bubbleWidth - r}
            A ${r},${r} 0 0 1 ${bubbleWidth},${r}
            V ${bubbleHeight - r}
            A ${r},${r} 0 0 1 ${bubbleWidth - r},${bubbleHeight}
            H ${bubbleWidth / 2 + tailWidth / 2}
            L ${bubbleWidth / 2},${bubbleHeight + tailHeight}
            L ${bubbleWidth / 2 - tailWidth / 2},${bubbleHeight}
            H ${r}
            A ${r},${r} 0 0 1 0,${bubbleHeight - r}
            V ${r}
            A ${r},${r} 0 0 1 ${r},0
            Z
        `;

        bubbleGroup.append('path')
            .attr('d', pathData.trim())
            .style('fill', 'rgba(30,30,30,0.8)')
            .style('stroke', '#CCCCCC')
            .style('stroke-width', 1.5);

        const text = bubbleGroup.append('text')
            .attr('class', 'speech-bubble-text')
            .attr('x', bubblePadding)
            .attr('y', bubblePadding + lineHeight / 2)
            .attr('dominant-baseline', 'middle');

        lines.forEach((line, i) => {
            text.append('tspan')
                .attr('x', bubblePadding)
                .attr('dy', i === 0 ? 0 : lineHeight)
                .text(line);
        });

        // Fade in
        bubbleGroup.transition()
            .duration(300)
            .style('opacity', 1);

        // Fade out and remove
        bubbleGroup.transition()
            .delay(5000)
            .duration(1000)
            .style('opacity', 0)
            .remove();
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

        // Find the specific node group for the sender
        const nodeElement = d3.select(state.nodeElements.nodes()[sender_index]);

        if (!nodeElement.empty()) {
            showSpeechBubble(nodeElement, message);
        } else {
            console.warn(`Speech bubble: Could not find node element for sender_index ${sender_index}.`);
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
            addFeedMessage(userMessage); // Show bubble for user's own message immediately
            elements.messageInput.value = '';
            
            try {
                const response = await fetch('/api/send_message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: messageText }),
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({detail: "Send failed"}));
                    console.error(`Error sending: ${errorData.detail}`);
                }
            } catch (error) {
                console.error("Network error sending message.", error);
            }
        }
    }

    async function resetSimulation() {
        const newStrategicChoice = state.includeStrategicAgents;
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
            state.simulationRunning = false;
            updateSimulationButton();
        } catch (error) {
            console.error(`Reset error: ${error.message}`);
        }
    }

    if (elements.sendButton) {
        elements.sendButton.addEventListener('click', sendMessage);
    }
    if(elements.messageInput) {
        elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }
    if (elements.resetButton) {
        elements.resetButton.addEventListener('click', resetSimulation);
    }
    if (elements.toggleSimulationButton) {
        elements.toggleSimulationButton.addEventListener('click', toggleSimulation);
    }

    fetchInitialState();
    connectWebSocket();
    checkSimulationStatus();
});