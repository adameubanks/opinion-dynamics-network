document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        opinionChart: document.getElementById('opinion-chart'),
        connectionChart: document.getElementById('connection-chart'),
        feedMessages: document.getElementById('feed'),
        updatesLog: document.getElementById('updates-log'),
        messageInput: document.getElementById('message-input'),
        sendButton: document.getElementById('send-button'),
        resetButton: document.getElementById('reset-button'),
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
        currentAdjacencyMatrix: []
    };

    let socket;

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
                    updateOpinionChart(state.currentOpinions);
                    if (state.currentAdjacencyMatrix && state.currentAdjacencyMatrix.length > 0) {
                        updateConnectionChart(state.currentOpinions, state.currentAdjacencyMatrix);
                    }
                }
            } else if (message.type === 'new_post') {
                addFeedMessage(message.data);
            } else if (message.type === 'updates_log') {
                updateUpdatesLog(message.data);
            } else if (message.type === 'initial_state_full' || message.type === 'reset_complete') {
                initializeSimulationState(message.data);
                initializeOpinionChart();
                if (state.currentAdjacencyMatrix && state.currentAdjacencyMatrix.length > 0) {
                    initializeConnectionChart(state.currentOpinions, state.currentAdjacencyMatrix, state.agentNames, state.opinionAxes);
                }
            } else if (message.type === 'system_message') {
                addFeedMessage({ 
                    sender_name: "System", 
                    sender_index: -1,
                    message: message.data.message, 
                    opinion_vector: [0.5,0.5]
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
            initializeOpinionChart();
            if (initialState.adjacency_matrix && initialState.adjacency_matrix.length > 0) {
                state.currentAdjacencyMatrix = initialState.adjacency_matrix;
                initializeConnectionChart(state.currentOpinions, state.currentAdjacencyMatrix, state.agentNames, state.opinionAxes);
            }
        } catch (error) {
            console.error("Failed to fetch initial state:", error);
            if (elements.opinionChart) elements.opinionChart.innerHTML = "<p>Error loading opinion data.</p>";
            if (elements.connectionChart) elements.connectionChart.innerHTML = "<p>Error loading connection data.</p>";
        }
    }
    
    function initializeSimulationState(stateData) {
        state.currentOpinions = stateData.opinions || [];
        state.agentNames = stateData.agent_names || [];
        state.opinionAxes = stateData.opinion_axes || [{name: 'X-Axis', pro:'', con:''}, {name: 'Y-Axis', pro:'', con:''}];
        state.nAgents = stateData.n_agents || 0;
        state.includeStrategicAgents = stateData.include_strategic_agents !== undefined ? stateData.include_strategic_agents : true;
        state.strategicAgentCount = stateData.strategic_agent_count || 0;
        state.userAgentIndex = stateData.user_agent_index !== undefined ? stateData.user_agent_index : 0;
        state.colorScalingParams = stateData.color_scaling_params || {x_min:0, x_max:1, y_min:0, y_max:1};
        if(elements.strategicCheckbox) elements.strategicCheckbox.checked = state.includeStrategicAgents;
        state.currentAdjacencyMatrix = stateData.adjacency_matrix || [];

        if(elements.feedMessages) elements.feedMessages.innerHTML = '';
        if(elements.updatesLog) elements.updatesLog.innerHTML = '';
    }

    function colorFormula(scaled_x, scaled_y) {
        const intensity = Math.sqrt(scaled_x * scaled_x + scaled_y * scaled_y) / Math.sqrt(2);
        let r = intensity * scaled_x + (1 - intensity);
        let g = (1 - intensity);
        let b = intensity * scaled_y + (1 - intensity);
        return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    }

    function scaleValue(val, min, max, target_min = 0.5, target_max = 1.0) {
        if (max > min) {
            const normalized = (val - min) / (max - min);
            return target_min + (target_max - target_min) * normalized;
        }
        return (target_min + target_max) / 2;
    }

    function getAgentColor(agentIndex, opinionVector) {
        if (agentIndex === -1) return '#6c757d';
        if (agentIndex === state.userAgentIndex) return 'gold';
        if (state.includeStrategicAgents && agentIndex >= state.nAgents - state.strategicAgentCount) return 'black';
        if (!opinionVector || opinionVector.length < 2) return 'grey';
        const sx = scaleValue(opinionVector[0], state.colorScalingParams.x_min, state.colorScalingParams.x_max);
        const sy = scaleValue(opinionVector[1], state.colorScalingParams.y_min, state.colorScalingParams.y_max);
        return colorFormula(sx, sy);
    }

    function createChartTrace(opinions, agentNames, isConnection = false) {
        const agentColors = opinions.map((op, i) => getAgentColor(i, op));
        const agentSizes = opinions.map((op, i) => {
            const isUser = i === state.userAgentIndex;
            const isStrategic = state.includeStrategicAgents && i >= state.nAgents - state.strategicAgentCount;
            return (isUser || isStrategic) ? (isConnection ? 10 : 12) : (isConnection ? 5 : 7);
        });
        const agentBorderColors = opinions.map((op, i) => {
            if (i === state.userAgentIndex) return 'darkorange';
            if (state.includeStrategicAgents && i >= state.nAgents - state.strategicAgentCount) return 'dimgray';
            return 'rgba(0,0,0,0)';
        });
        const agentBorderWidths = opinions.map((op, i) => {
            const isUser = i === state.userAgentIndex;
            const isStrategic = state.includeStrategicAgents && i >= state.nAgents - state.strategicAgentCount;
            return (isUser || isStrategic) ? (isConnection ? 1.5 : 2) : 0;
        });

        return {
            x: opinions.map(op => op[0]),
            y: opinions.map(op => op[1]),
            mode: 'markers',
            type: 'scatter',
            text: agentNames,
            hoverinfo: isConnection ? 'text' : 'text+x+y',
            marker: { color: agentColors, size: agentSizes, line: { color: agentBorderColors, width: agentBorderWidths } }
        };
    }

    function initializeOpinionChart() {
        if (!elements.opinionChart || !state.currentOpinions || state.currentOpinions.length === 0) {
            if (elements.opinionChart) elements.opinionChart.innerHTML = "<p>Waiting for opinion data...</p>";
            return;
        }

        const trace = createChartTrace(state.currentOpinions, state.agentNames);
        const layout = {
            title: 'Distribution of Opinions',
            xaxis: { title: state.opinionAxes[0]?.name || 'Opinion Axis 1', range: [0, 1] },
            yaxis: { title: state.opinionAxes[1]?.name || 'Opinion Axis 2', range: [0, 1] },
            margin: { t: 50, b: 50, l: 50, r: 30 },
            hovermode: 'closest',
        };
        Plotly.newPlot(elements.opinionChart, [trace], layout, {responsive: true});
    }

    function updateOpinionChart(opinions) {
        if (!elements.opinionChart || !opinions || opinions.length === 0) return;
        state.currentOpinions = opinions;
        const agentColors = opinions.map((op, i) => getAgentColor(i, op));
        Plotly.animate(elements.opinionChart, {
            data: [{ x: opinions.map(op => op[0]), y: opinions.map(op => op[1]), marker: { color: agentColors } }],
            traces: [0],
            layout: {}
        }, {
            transition: { duration: 500, easing: 'cubic-in-out' },
            frame: { duration: 500 }
        }).catch(err => {
            Plotly.restyle(elements.opinionChart, { 'x': [opinions.map(op => op[0])], 'y': [opinions.map(op => op[1])], 'marker.color': [agentColors] });
        });
    }

    function createEdgeTrace(opinions, adjMatrix) {
        const N = opinions.length;
        const edges_x = [];
        const edges_y = [];
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                if (adjMatrix[i][j] === 1) {
                    edges_x.push(opinions[i][0], opinions[j][0], null);
                    edges_y.push(opinions[i][1], opinions[j][1], null);
                }
            }
        }
        return { x: edges_x, y: edges_y, mode: 'lines', type: 'scatter', line: { width: 0.5, color: '#888' }, hoverinfo: 'none' };
    }

    function initializeConnectionChart(opinions, adjMatrix, agentNamesArr, opinionAxesInfo) {
        if (!elements.connectionChart || !opinions || opinions.length === 0 || !adjMatrix || adjMatrix.length === 0) {
            if(elements.connectionChart) elements.connectionChart.innerHTML = "<p>Waiting for connection data...</p>";
            return;
        }

        const edge_trace = createEdgeTrace(opinions, adjMatrix);
        const node_trace = createChartTrace(opinions, agentNamesArr, true);
        
        const layout = {
            title: 'Agent Connections (Layout by Opinion)',
            xaxis: { title: opinionAxesInfo[0]?.name || 'Opinion Axis 1', range: [0, 1], showgrid: false, zeroline: false, visible: true },
            yaxis: { title: opinionAxesInfo[1]?.name || 'Opinion Axis 2', range: [0, 1], showgrid: false, zeroline: false, visible: true },
            margin: { t: 50, b: 50, l: 50, r: 30 },
            hovermode: 'closest',
            showlegend: false,
            plot_bgcolor: 'rgba(250,250,250,1)'
        };
        Plotly.newPlot(elements.connectionChart, [edge_trace, node_trace], layout, {responsive: true});
    }

    function updateConnectionChart(opinions, adjMatrix) {
        if (!elements.connectionChart || !opinions || opinions.length === 0 || !adjMatrix || adjMatrix.length === 0) return;
        
        const edges = createEdgeTrace(opinions, adjMatrix);
        const node_colors = opinions.map((op, i) => getAgentColor(i, op));
        
        try {
            Plotly.restyle(elements.connectionChart, { x: [edges.x], y: [edges.y] }, 0);
            Plotly.restyle(elements.connectionChart, { 
                x: [opinions.map(op => op[0])], 
                y: [opinions.map(op => op[1])], 
                'marker.color': [node_colors] 
            }, 1);
        } catch (err) {
            console.error("Plotly.restyle failed for connection chart:", err);
        }
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
        const borderColor = getAgentColor(sender_index, opinion_vector || (state.currentOpinions[sender_index] ? state.currentOpinions[sender_index] : [0.5,0.5]));
        postDiv.style.borderLeft = `4px solid ${borderColor}`;
        elements.feedMessages.appendChild(postDiv);
        elements.feedMessages.scrollTop = elements.feedMessages.scrollHeight;
    }

    function updateUpdatesLog(updatesArray) {
        if (!elements.updatesLog) return;
        updatesArray.forEach(updateMsg => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('update-item');
            itemDiv.textContent = updateMsg;
            elements.updatesLog.appendChild(itemDiv);
            elements.updatesLog.scrollTop = elements.updatesLog.scrollHeight;
        });
    }

    async function sendMessage() {
        const messageText = elements.messageInput.value.trim();
        if (messageText && socket && socket.readyState === WebSocket.OPEN) {
            const userMessage = {
                sender_name: state.agentNames[state.userAgentIndex] || "User",
                sender_index: state.userAgentIndex,
                message: messageText,
                opinion_vector: state.currentOpinions[state.userAgentIndex] || [0.5, 0.5]
            };
            addFeedMessage(userMessage);
            elements.messageInput.value = '';
            
            try {
                const response = await fetch('/api/send_message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: messageText }),
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({detail: "Send failed"}));
                    addFeedMessage({ sender_name: "System", sender_index: -1, message: `Error sending: ${errorData.detail}`, opinion_vector: [0.5,0.5]});
                }
            } catch (error) {
                addFeedMessage({ sender_name: "System", sender_index: -1, message: "Network error sending message.", opinion_vector: [0.5,0.5]});
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
            addFeedMessage({ sender_name: "System", sender_index: -1, message: "Simulation resetting...", opinion_vector: [0.5,0.5] });
        } catch (error) {
            addFeedMessage({ sender_name: "System", sender_index: -1, message: `Reset error: ${error.message}`, opinion_vector: [0.5,0.5] });
        }
    }

    if (elements.sendButton) elements.sendButton.addEventListener('click', sendMessage);
    if (elements.messageInput) elements.messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
    if (elements.resetButton) elements.resetButton.addEventListener('click', resetSimulation);

    fetchInitialState();
    connectWebSocket();
}); 