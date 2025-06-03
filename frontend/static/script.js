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
        nodeElements: null
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
                if (state.currentOpinions && state.currentOpinions.length > 0) {
                    if (state.currentAdjacencyMatrix && state.currentAdjacencyMatrix.length > 0) {
                        updateConnectionChart(state.currentOpinions, state.currentAdjacencyMatrix);
                    }
                }
            } else if (message.type === 'new_post') {
                addFeedMessage(message.data);
            } else if (message.type === 'initial_state_full' || message.type === 'reset_complete') {
                initializeSimulationState(message.data);
                if (state.currentAdjacencyMatrix && state.currentAdjacencyMatrix.length > 0) {
                    initializeConnectionChart(state.currentOpinions, state.currentAdjacencyMatrix, state.agentNames, state.opinionAxes);
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
                initializeConnectionChart(state.currentOpinions, state.currentAdjacencyMatrix, state.agentNames, state.opinionAxes);
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

        // Hair
        avatarGroup.append('path')
            .attr('d', 'M 8 10 Q 20 5 32 10 Q 32 15 20 15 Q 8 15 8 10')
            .attr('fill', avatarConfig.hairColor)
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

        return avatarGroup;
    }

    function createD3Nodes(opinions, agentNames) {
        return opinions.map((opinion, i) => ({
            id: i,
            name: agentNames[i] || `Agent ${i}`,
            opinion: opinion[0],
            x: Math.random() * 400 + 200,
            y: Math.random() * 300 + 150,
            isUser: i === state.userAgentIndex,
            isStrategic: state.includeStrategicAgents && i >= state.nAgents - state.strategicAgentCount
        }));
    }

    function createD3Links(adjMatrix) {
        const links = [];
        for (let i = 0; i < adjMatrix.length; i++) {
            for (let j = i + 1; j < adjMatrix[i].length; j++) {
                if (adjMatrix[i][j] === 1) {
                    links.push({
                        source: i,
                        target: j
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

    function applyPolarizationForce(extremeness) {
        if (state.simulation && extremeness > 0.4) {
            console.log(`Applying HIGH polarization force (extremeness: ${extremeness.toFixed(3)})`);
            // Very strong polarization force for high extremeness
            state.simulation.force('opinion_cluster').strength(2.0);
            state.simulation.force('x').strength(0.01);
            state.simulation.force('charge').strength(-300);
            state.simulation.force('center').strength(0.01);
            state.simulation.alpha(1.0).restart();
            
            setTimeout(() => {
                if (state.simulation) {
                    state.simulation.force('opinion_cluster').strength(0.1);
                    state.simulation.force('x').strength(0.05);
                    state.simulation.force('charge').strength(-100);
                    state.simulation.force('center').strength(0.02);
                }
            }, 20000);
        } else if (state.simulation && extremeness >= 0.2) {
            console.log(`Applying MEDIUM adjustment force (extremeness: ${extremeness.toFixed(3)})`);
            // Strong medium adjustment force 
            state.simulation.force('opinion_cluster').strength(1.0);
            state.simulation.force('center').strength(0.05);
            state.simulation.force('charge').strength(-200);
            state.simulation.force('x').strength(0.02);
            state.simulation.alpha(0.8).restart();
            
            setTimeout(() => {
                if (state.simulation) {
                    state.simulation.force('opinion_cluster').strength(0.1);
                    state.simulation.force('center').strength(0.02);
                    state.simulation.force('charge').strength(-100);
                    state.simulation.force('x').strength(0.05);
                }
            }, 8000);
        } else if (state.simulation) {
            console.log(`Applying LOW moderation force (extremeness: ${extremeness.toFixed(3)})`);
            // Very strong moderation force for low extremeness
            state.simulation.force('opinion_cluster').strength(0.02);
            state.simulation.force('center').strength(1.0);
            state.simulation.force('charge').strength(-50);
            state.simulation.force('x').strength(0.01);
            state.simulation.alpha(0.8).restart();
            
            setTimeout(() => {
                if (state.simulation) {
                    state.simulation.force('opinion_cluster').strength(0.1);
                    state.simulation.force('center').strength(0.02);
                    state.simulation.force('charge').strength(-100);
                    state.simulation.force('x').strength(0.05);
                }
            }, 10000);
        }
    }

    function createChartTrace(opinions, agentNames) {
        // Legacy function - replaced by createD3Nodes
        return createD3Nodes(opinions, agentNames);
    }

    function createEdgeTrace(opinions, adjMatrix) {
        // Legacy function - replaced by createD3Links  
        return createD3Links(adjMatrix);
    }

    function initializeD3Network(opinions, adjMatrix, agentNamesArr, opinionAxesInfo) {
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
        const links = createD3Links(adjMatrix);
        
        // Setup force simulation
        state.simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).strength(0.3))
            .force("charge", d3.forceManyBody().strength(-100))
            .force("center", d3.forceCenter(width/2, height/2).strength(0.02))
            .force("x", d3.forceX().x(d => d.opinion * width).strength(0.05))
            .force("collision", d3.forceCollide().radius(25))
            .force("opinion_cluster", d3.forceX().x(d => {
                // Create opinion-based clustering with wider thresholds
                if (d.opinion < 0.45) return width * 0.15; // Haters cluster far left
                if (d.opinion > 0.55) return width * 0.85; // Lovers cluster far right  
                return width * 0.5; // Neutrals in center
            }).strength(0.1));

        // Create link elements
        const linkElements = linkGroup.selectAll('.network-edge')
            .data(links)
            .enter()
            .append('line')
            .attr('class', 'network-edge');

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

    function initializeConnectionChart(opinions, adjMatrix, agentNamesArr, opinionAxesInfo) {
        // Replace with D3 implementation
        return initializeD3Network(opinions, adjMatrix, agentNamesArr, opinionAxesInfo);
    }

    function updateD3Network(opinions, adjMatrix) {
        if (!elements.connectionChart || !opinions || opinions.length === 0 || !adjMatrix || adjMatrix.length === 0 || !state.simulation) return;
        
        // Update node data with new opinions
        state.nodePositions.forEach((node, i) => {
            if (opinions[i]) {
                node.opinion = opinions[i][0];
            }
        });
        
        // Update links if adjacency matrix changed
        const newLinks = createD3Links(adjMatrix);
        
        // Update force simulation with new data
        state.simulation.nodes(state.nodePositions);
        state.simulation.force("link").links(newLinks);
        
        // Update opinion-based X positioning
        const container = d3.select('#connection-chart');
        const width = container.node().getBoundingClientRect().width;
        state.simulation.force("x").x(d => d.opinion * width);
        
        // Update opinion clustering with new thresholds
        state.simulation.force("opinion_cluster").x(d => {
            if (d.opinion < 0.45) return width * 0.15; // Haters cluster far left
            if (d.opinion > 0.55) return width * 0.85; // Lovers cluster far right  
            return width * 0.5; // Neutrals in center
        });
        
        // Restart simulation
        state.simulation.alpha(0.3).restart();
        
        // Update visual elements
        if (state.linkElements && state.nodeElements) {
            // Update links
            const linkUpdate = state.linkElements.data(newLinks);
            linkUpdate.exit().remove();
            const linkEnter = linkUpdate.enter().append('line').attr('class', 'network-edge');
            state.linkElements = linkEnter.merge(linkUpdate);
            
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
            
            // Calculate opinion extremeness to trigger polarization
            const avgOpinion = opinions.reduce((sum, op) => sum + op[0], 0) / opinions.length;
            const variance = opinions.reduce((sum, op) => sum + Math.pow(op[0] - avgOpinion, 2), 0) / opinions.length;
            const extremeness = Math.sqrt(variance) * 2; // Reduce scaling to allow moderate forces
            
            // Debug logging
            console.log(`Extremeness: ${extremeness.toFixed(3)}, Avg Opinion: ${avgOpinion.toFixed(3)}, Variance: ${variance.toFixed(3)}`);
            
            // Apply force for ALL extremeness levels - every post moves the network
            applyPolarizationForce(extremeness);
        }
    }

    function updateConnectionChart(opinions, adjMatrix) {
        // Replace with D3 implementation
        return updateD3Network(opinions, adjMatrix);
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
        
        // Trigger immediate network forces for AI posts based on their opinion vector
        if (sender_index > 0 && sender_name !== "System") {
            // Get opinion from the post data or current state
            let agentOpinion = 0.5;
            if (opinion_vector && opinion_vector.length > 0) {
                agentOpinion = opinion_vector[0];
            } else if (state.currentOpinions[sender_index]) {
                agentOpinion = state.currentOpinions[sender_index][0];
            }
            
            const distanceFromCenter = Math.abs(agentOpinion - 0.5);
            const extremeness = distanceFromCenter * 4; // Scale 0-0.5 distance to 0-2 range
            
            console.log(`AI post from ${sender_name}: opinion=${agentOpinion.toFixed(3)}, distance=${distanceFromCenter.toFixed(3)}, extremeness=${extremeness.toFixed(3)}`);
            
            // Apply immediate force based on opinion extremeness
            applyPolarizationForce(extremeness);
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
                    
                    // Use the analyzed opinion from the backend response
                    let analyzedOpinion = 0.5;
                    if (result.analyzed_opinion && result.analyzed_opinion.length > 0) {
                        analyzedOpinion = result.analyzed_opinion[0];
                    }
                    
                    // Calculate extremeness based on the analyzed opinion vector
                    const distanceFromCenter = Math.abs(analyzedOpinion - 0.5);
                    const extremeness = distanceFromCenter * 4; // Scale 0-0.5 distance to 0-2 range
                    
                    console.log(`User post analyzed: opinion=${analyzedOpinion.toFixed(3)}, distance=${distanceFromCenter.toFixed(3)}, extremeness=${extremeness.toFixed(3)}`);
                    
                    // Apply immediate force based on analyzed opinion extremeness
                    applyPolarizationForce(extremeness);
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