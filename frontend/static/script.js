document.addEventListener('DOMContentLoaded', () => {
    const opinionChartDiv = document.getElementById('opinion-chart');
    const connectionChartDiv = document.getElementById('connection-chart'); // New chart div
    const feedMessagesDiv = document.getElementById('feed-messages');
    const updatesLogDiv = document.getElementById('updates-log');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const resetButton = document.getElementById('reset-button');
    const strategicCheckbox = document.getElementById('strategic-agents-checkbox');

    let currentOpinions = [];
    let agentNames = [];
    let opinionAxes = [];
    let nAgents = 0;
    let includeStrategicAgents = true;
    let strategicAgentCount = 0;
    let userAgentIndex = 0;
    let colorScalingParams = {};
    let currentAdjacencyMatrix = []; // Store current adjacency matrix

    // WebSocket connection
    let socket;

    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}/ws/simulation_updates`);

        socket.onopen = () => {
            console.log("WebSocket connection established.");
        };

        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'opinion_update') {
                currentOpinions = message.data;
                if (message.color_scaling_params) {
                    colorScalingParams = message.color_scaling_params;
                }
                if (message.adjacency_matrix) {
                    currentAdjacencyMatrix = message.adjacency_matrix;
                }
                if (currentOpinions && currentOpinions.length > 0) {
                    updateOpinionChart(currentOpinions);
                    if (currentAdjacencyMatrix && currentAdjacencyMatrix.length > 0) {
                        updateConnectionChart(currentOpinions, currentAdjacencyMatrix);
                    }
                } else {
                    console.warn("Received empty or invalid opinion data:", currentOpinions);
                }
            } else if (message.type === 'new_post') {
                addFeedMessage(message.data);
            } else if (message.type === 'updates_log') {
                updateUpdatesLog(message.data);
            } else if (message.type === 'initial_state_full' || message.type === 'reset_complete') {
                console.log("Received full state refresh from WebSocket:", message.data);
                initializeSimulationState(message.data);
                initializeOpinionChart();
                 if (currentAdjacencyMatrix && currentAdjacencyMatrix.length > 0) {
                    initializeConnectionChart(currentOpinions, currentAdjacencyMatrix, agentNames, opinionAxes);
                } else {
                    console.warn("Adjacency matrix not available in full state refresh for connection chart.");
                }
            } else if (message.type === 'system_message') {
                addFeedMessage({ 
                    sender_name: "System", 
                    sender_index: -1, // Or a dedicated system index
                    message: message.data.message, 
                    opinion_vector: [0.5,0.5] // Neutral color for system messages
                });
            }
        };

        socket.onclose = () => {
            console.log("WebSocket connection closed. Attempting to reconnect...");
            setTimeout(connectWebSocket, 5000);
        };

        socket.onerror = (error) => {
            console.error("WebSocket error:", error);
        };
    }

    async function fetchInitialState() {
        try {
            const response = await fetch('/api/initial_state');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const initialState = await response.json();
            console.log("Initial state fetched:", initialState);
            initializeSimulationState(initialState);
            initializeOpinionChart();
            if (initialState.adjacency_matrix && initialState.adjacency_matrix.length > 0) {
                currentAdjacencyMatrix = initialState.adjacency_matrix;
                initializeConnectionChart(currentOpinions, currentAdjacencyMatrix, agentNames, opinionAxes);
            } else {
                console.warn("Adjacency matrix not available in initial state for connection chart.");
            }
        } catch (error) {
            console.error("Failed to fetch initial state:", error);
            if (opinionChartDiv) opinionChartDiv.innerHTML = "<p>Error loading opinion data.</p>";
            if (connectionChartDiv) connectionChartDiv.innerHTML = "<p>Error loading connection data.</p>";
        }
    }
    
    function initializeSimulationState(stateData) {
        currentOpinions = stateData.opinions || [];
        agentNames = stateData.agent_names || [];
        opinionAxes = stateData.opinion_axes || [{name: 'X-Axis', pro:'', con:''}, {name: 'Y-Axis', pro:'', con:''}];
        nAgents = stateData.n_agents || 0;
        includeStrategicAgents = stateData.include_strategic_agents !== undefined ? stateData.include_strategic_agents : true;
        strategicAgentCount = stateData.strategic_agent_count || 0;
        userAgentIndex = stateData.user_agent_index !== undefined ? stateData.user_agent_index : 0;
        colorScalingParams = stateData.color_scaling_params || {x_min:0, x_max:1, y_min:0, y_max:1};
        if(strategicCheckbox) strategicCheckbox.checked = includeStrategicAgents;
        currentAdjacencyMatrix = stateData.adjacency_matrix || [];

        if(feedMessagesDiv) feedMessagesDiv.innerHTML = '';
        if(updatesLogDiv) updatesLogDiv.innerHTML = '';
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
        if (agentIndex === -1) return '#6c757d'; // System message color (e.g., gray)
        if (agentIndex === userAgentIndex) return 'gold';
        if (includeStrategicAgents && agentIndex >= nAgents - strategicAgentCount) return 'black';
        if (!opinionVector || opinionVector.length < 2) return 'grey';
        const sx = scaleValue(opinionVector[0], colorScalingParams.x_min, colorScalingParams.x_max);
        const sy = scaleValue(opinionVector[1], colorScalingParams.y_min, colorScalingParams.y_max);
        return colorFormula(sx, sy);
    }

    function initializeOpinionChart() {
        if (!opinionChartDiv) return;
        if (!currentOpinions || currentOpinions.length === 0) {
            console.warn("No opinion data to initialize chart.");
            opinionChartDiv.innerHTML = "<p>Waiting for opinion data...</p>";
            return;
        }
        const agentColors = currentOpinions.map((op, i) => getAgentColor(i, op));
        const agentSizes = currentOpinions.map((op, i) => (i === userAgentIndex || (includeStrategicAgents && i >= nAgents - strategicAgentCount)) ? 12 : 7);
        const agentBorderColors = currentOpinions.map((op, i) => (i === userAgentIndex) ? 'darkorange' : ((includeStrategicAgents && i >= nAgents - strategicAgentCount)) ? 'dimgray' : 'rgba(0,0,0,0)');
        const agentBorderWidths = currentOpinions.map((op, i) => (i === userAgentIndex || (includeStrategicAgents && i >= nAgents - strategicAgentCount)) ? 2 : 0);
        const trace = {
            x: currentOpinions.map(op => op[0]),
            y: currentOpinions.map(op => op[1]),
            mode: 'markers',
            type: 'scatter',
            text: agentNames,
            hoverinfo: 'text+x+y',
            marker: { color: agentColors, size: agentSizes, line: { color: agentBorderColors, width: agentBorderWidths } }
        };
        const layout = {
            title: 'Distribution of Opinions',
            xaxis: { title: opinionAxes[0]?.name || 'Opinion Axis 1', range: [0, 1] },
            yaxis: { title: opinionAxes[1]?.name || 'Opinion Axis 2', range: [0, 1] },
            margin: { t: 50, b: 50, l: 50, r: 30 },
            hovermode: 'closest',
        };
        Plotly.newPlot(opinionChartDiv, [trace], layout, {responsive: true});
    }

    function updateOpinionChart(opinions) {
        if (!opinionChartDiv || !opinions || opinions.length === 0) return;
        currentOpinions = opinions;
        const agentColors = opinions.map((op, i) => getAgentColor(i, op));
        Plotly.animate(opinionChartDiv, {
            data: [{ x: opinions.map(op => op[0]), y: opinions.map(op => op[1]), marker: { color: agentColors } }],
            traces: [0],
            layout: {}
        }, {
            transition: { duration: 500, easing: 'cubic-in-out' },
            frame: { duration: 500 }
        }).catch(err => {
            console.warn("Plotly.animate failed, falling back to restyle:", err);
            Plotly.restyle(opinionChartDiv, { 'x': [opinions.map(op => op[0])], 'y': [opinions.map(op => op[1])], 'marker.color': [agentColors] });
        });
    }

    // --- Connection Chart Functions ---
    function initializeConnectionChart(opinions, adjMatrix, agentNamesArr, opinionAxesInfo) {
        if (!connectionChartDiv || !opinions || opinions.length === 0 || !adjMatrix || adjMatrix.length === 0) {
            console.warn("Cannot initialize connection chart: missing data.");
            if(connectionChartDiv) connectionChartDiv.innerHTML = "<p>Waiting for connection data...</p>";
            return;
        }
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
        const edge_trace = { x: edges_x, y: edges_y, mode: 'lines', type: 'scatter', line: { width: 0.5, color: '#888' }, hoverinfo: 'none' };
        const node_colors = opinions.map((op, i) => getAgentColor(i, op));
        const node_sizes = opinions.map((op, i) => (i === userAgentIndex || (includeStrategicAgents && i >= nAgents - strategicAgentCount)) ? 10 : 5);
        const node_border_colors = opinions.map((op, i) => (i === userAgentIndex) ? 'darkorange' : ((includeStrategicAgents && i >= nAgents - strategicAgentCount)) ? 'dimgray' : 'rgba(0,0,0,0)');
        const node_border_widths = opinions.map((op, i) => (i === userAgentIndex || (includeStrategicAgents && i >= nAgents - strategicAgentCount)) ? 1.5 : 0);
        const node_trace = {
            x: opinions.map(op => op[0]),
            y: opinions.map(op => op[1]),
            mode: 'markers',
            type: 'scatter',
            text: agentNamesArr,
            hoverinfo: 'text',
            marker: { color: node_colors, size: node_sizes, line: { color: node_border_colors, width: node_border_widths } }
        };
        const layout = {
            title: 'Agent Connections (Layout by Opinion)',
            xaxis: { title: opinionAxesInfo[0]?.name || 'Opinion Axis 1', range: [0, 1], showgrid: false, zeroline: false, visible: true },
            yaxis: { title: opinionAxesInfo[1]?.name || 'Opinion Axis 2', range: [0, 1], showgrid: false, zeroline: false, visible: true },
            margin: { t: 50, b: 50, l: 50, r: 30 },
            hovermode: 'closest',
            showlegend: false,
            plot_bgcolor: 'rgba(250,250,250,1)'
        };
        Plotly.newPlot(connectionChartDiv, [edge_trace, node_trace], layout, {responsive: true});
    }

    function updateConnectionChart(opinions, adjMatrix) {
        if (!connectionChartDiv || !opinions || opinions.length === 0 || !adjMatrix || adjMatrix.length === 0) {
            console.warn("Cannot update connection chart: missing data.");
            return;
        }
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
        const node_colors = opinions.map((op, i) => getAgentColor(i, op));
        
        // Update edges (trace 0) and nodes (trace 1) separately
        try {
            // Update edge trace (trace 0)
            Plotly.restyle(connectionChartDiv, { x: [edges_x], y: [edges_y] }, 0);
            // Update node trace (trace 1)
            Plotly.restyle(connectionChartDiv, { 
                x: [opinions.map(op => op[0])], 
                y: [opinions.map(op => op[1])], 
                'marker.color': [node_colors] 
            }, 1);
        } catch (err) {
            console.error("Plotly.restyle failed for connection chart:", err);
        }
    }
    // --- End Connection Chart Functions ---

    function addFeedMessage(postData) {
        if (!feedMessagesDiv) return;
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
        const borderColor = getAgentColor(sender_index, opinion_vector || (currentOpinions[sender_index] ? currentOpinions[sender_index] : [0.5,0.5]));
        postDiv.style.borderLeft = `4px solid ${borderColor}`;
        feedMessagesDiv.appendChild(postDiv);
        feedMessagesDiv.scrollTop = feedMessagesDiv.scrollHeight;
    }

    function updateUpdatesLog(updatesArray) {
        if (!updatesLogDiv) return;
        // Append new updates instead of replacing all (for staggered responses)
        updatesArray.forEach(updateMsg => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('update-item');
            itemDiv.textContent = updateMsg;
            updatesLogDiv.appendChild(itemDiv);
            
            // Auto-scroll to show latest update
            updatesLogDiv.scrollTop = updatesLogDiv.scrollHeight;
        });
    }

    async function sendMessage() {
        const messageText = messageInput.value.trim();
        if (messageText && socket && socket.readyState === WebSocket.OPEN) {
            // Optimistic UI update - show user's message immediately
            const userMessage = {
                sender_name: agentNames[userAgentIndex] || "User",
                sender_index: userAgentIndex,
                message: messageText,
                opinion_vector: currentOpinions[userAgentIndex] || [0.5, 0.5]
            };
            addFeedMessage(userMessage);
            
            // Clear input immediately for better UX
            messageInput.value = '';
            
            try {
                const response = await fetch('/api/send_message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: messageText }),
                });
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({detail: "Send failed"}));
                    console.error("Failed to send message:", response.status, errorData.detail);
                    addFeedMessage({ sender_name: "System", sender_index: -1, message: `Error sending: ${errorData.detail}`, opinion_vector: [0.5,0.5]});
                }
            } catch (error) {
                console.error("Error sending message:", error);
                addFeedMessage({ sender_name: "System", sender_index: -1, message: "Network error sending message.", opinion_vector: [0.5,0.5]});
            }
        } else if (!messageText) {
            console.log("Message is empty.");
        } else {
            console.error("WebSocket not connected or message input error.");
        }
    }

    async function resetSimulation() {
        console.log("Resetting simulation...");
        const newStrategicChoice = strategicCheckbox ? strategicCheckbox.checked : includeStrategicAgents;
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
            // const result = await response.json(); // Backend now sends full state via WS
            console.log("Simulation reset signal sent. Waiting for WebSocket update.");
            addFeedMessage({ sender_name: "System", sender_index: -1, message: "Simulation resetting...", opinion_vector: [0.5,0.5] });
        } catch (error) {
            console.error("Error resetting simulation:", error);
            addFeedMessage({ sender_name: "System", sender_index: -1, message: `Reset error: ${error.message}`, opinion_vector: [0.5,0.5] });
        }
    }

    if (sendButton) sendButton.addEventListener('click', sendMessage);
    if (messageInput) messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
    if (resetButton) resetButton.addEventListener('click', resetSimulation);
    if (strategicCheckbox) {
        strategicCheckbox.addEventListener('change', () => {
            console.log("Include Strategic Agents toggled to:", strategicCheckbox.checked);
        });
    }

    fetchInitialState();
    connectWebSocket();
}); 