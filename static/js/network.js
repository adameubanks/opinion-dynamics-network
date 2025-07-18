import { FORCE_CONFIG, getShirtColorFromOpinion } from './utils.js';
import { generateAvatarData, drawAvatar } from './avatars.js';
import { createStatisticsDisplay, updateStatisticsDisplay, createOpinionAxis } from './ui-components.js';

function hasSignificantOpinionChange(currentOpinions, previousOpinions, threshold) {
    if (!previousOpinions || previousOpinions.length === 0) return true;
    if (currentOpinions.length !== previousOpinions.length) return true;
    
    for (let i = 0; i < currentOpinions.length; i++) {
        const currentOpinion = currentOpinions[i][0];
        const previousOpinion = previousOpinions[i][0];
        if (Math.abs(currentOpinion - previousOpinion) > threshold) {
            return true;
        }
    }
    return false;
}

export function createD3Nodes(opinions, agentNames, height, userAgentIndex) {
    const container = d3.select('#connection-chart');
    const width = container.node().getBoundingClientRect().width;
    const margin = 60;
    
    return opinions.map((opinion, i) => ({
        id: i,
        name: agentNames[i] || `Agent ${i}`,
        opinion: opinion[0],
        x: margin + (width - 2 * margin) * opinion[0] + (Math.random() - 0.5) * 30,
        y: margin + (height - 2 * margin) * (0.3 + Math.random() * 0.4),
        isUser: i === userAgentIndex,
    }));
}

export function createD3Links(adjMatrix, edgeWeights) {
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

export function createD3NetworkElements(container) {
    container.selectAll('*').remove();
    
    const svg = container.append('svg')
        .attr('class', 'd3-network-container')
        .attr('width', '100%')
        .attr('height', '100%');
    
    const width = container.node().getBoundingClientRect().width;
    const height = container.node().getBoundingClientRect().height;
    
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    
    const linkGroup = svg.append('g').attr('class', 'links');
    const nodeGroup = svg.append('g').attr('class', 'nodes');
    const statisticsGroup = createStatisticsDisplay(svg, width);
    const axisGroup = createOpinionAxis(svg, width, height);
    
    return { svg, linkGroup, nodeGroup, statisticsGroup, axisGroup, width, height };
}

function updateElements(linkElements, nodeElements, newLinks, nodes, state) {
    if (!linkElements || !nodeElements) return;

    // Update links
    linkElements.data(newLinks)
        .transition()
        .duration(1500)
        .ease(d3.easeCubicInOut)
        .attr('stroke-width', d => d.thickness)
        .attr('stroke-opacity', d => d.opacity);
    
    // Update avatars
    nodeElements.each(function(d, i) {
        const avatar = d3.select(this).select('.avatar');
        if (avatar.node()) {
            avatar.select('.avatar-body')
                .transition()
                .duration(1200)
                .ease(d3.easeBackOut)
                .attr('fill', getShirtColorFromOpinion(d.opinion));
            
            const newExpression = d.opinion < 0.3 ? 'concerned' : 
                                d.opinion > 0.7 ? 'excited' : 'neutral';
            
            const scaleFactor = 2.5;
            const mouthPaths = {
                happy: `M ${16 * scaleFactor} ${18 * scaleFactor} Q ${20 * scaleFactor} ${22 * scaleFactor} ${24 * scaleFactor} ${18 * scaleFactor}`,
                concerned: `M ${16 * scaleFactor} ${20 * scaleFactor} Q ${20 * scaleFactor} ${16 * scaleFactor} ${24 * scaleFactor} ${20 * scaleFactor}`,
                excited: `M ${16 * scaleFactor} ${17 * scaleFactor} Q ${20 * scaleFactor} ${23 * scaleFactor} ${24 * scaleFactor} ${17 * scaleFactor}`,
                neutral: `M ${16 * scaleFactor} ${19 * scaleFactor} L ${24 * scaleFactor} ${19 * scaleFactor}`
            };
            
            avatar.select('.mouth')
                .transition()
                .duration(800)
                .ease(d3.easeCubicInOut)
                .attr('d', mouthPaths[newExpression] || mouthPaths.neutral);
        }
    });
}

export function initializeD3Network(opinions, adjMatrix, agentNames, opinionAxes, edgeWeights, state, elements) {
    if (!elements.connectionChart || !opinions || opinions.length === 0 || !adjMatrix || adjMatrix.length === 0) {
        if(elements.connectionChart) elements.connectionChart.innerHTML = "<p>Waiting for connection data...</p>";
        return;
    }

    state.avatarData = generateAvatarData(state.nAgents);
    
    const { svg, linkGroup, nodeGroup, statisticsGroup, axisGroup, width, height } = 
        createD3NetworkElements(d3.select('#connection-chart'));
    
    const nodes = createD3Nodes(opinions, agentNames, height, state.userAgentIndex);
    nodes.forEach(d => {
        if (!d.x || !d.y) {
            d.x = Math.random() * width;
            d.y = Math.random() * height;
        }
        d.radius = 60;
    });
    const links = createD3Links(adjMatrix, edgeWeights);
    
    console.log(`Initializing network: ${nodes.length} agents, ${links.length} initial connections`);
    
    state.simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.distance).strength(d => d.weight * FORCE_CONFIG.linkStrength))
        .force("charge", d3.forceManyBody().strength(FORCE_CONFIG.chargeStrength))
        .force("collision", d3.forceCollide().radius(FORCE_CONFIG.collisionRadius))
        .force("opinion_cluster", d3.forceX(d => width * 0.05 + (width * 0.9 * d.opinion)).strength(FORCE_CONFIG.opinionStrength))
        .force("influence", d3.forceX().strength(0))
        .force("y_centering", d3.forceY(height / 2).strength(FORCE_CONFIG.yCenteringStrength));

    const linkElements = linkGroup.selectAll('.network-edge')
        .data(links)
        .enter()
        .append('line')
        .attr('class', 'network-edge')
        .attr('stroke-width', d => d.thickness)
        .attr('stroke-opacity', d => d.opacity)
        .attr('stroke', '#FFFFFF');

    const nodeElements = nodeGroup.selectAll('.network-node')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', d => {
            let classes = 'network-node';
            if (d.isUser) classes += ' user-node';
            return classes;
        });

    nodeElements.each(function(d, i) {
        drawAvatar(d3.select(this), state.avatarData[i], i, d.opinion, state.userAgentIndex);
    });

    nodeElements.filter('.user-node').raise();

    state.simulation.on("tick", () => {
        const containerNode = d3.select('#connection-chart').node();
        if (!containerNode) return;

        const avatarRadius = 50;
        state.nodePositions.forEach(node => {
            node.x = Math.max(avatarRadius, Math.min(width - avatarRadius, node.x));
            node.y = Math.max(avatarRadius, Math.min(height - avatarRadius, node.y));
        });

        if (state.linkElements) {
            state.linkElements
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
        }

        if (state.nodeElements) {
            state.nodeElements
                .attr('transform', d => `translate(${d.x}, ${d.y})`);
        }
    });

    state.linkElements = linkElements;
    state.nodeElements = nodeElements;
    state.nodePositions = nodes;
    state.statisticsGroup = statisticsGroup;
    
    updateStatisticsDisplay(statisticsGroup, opinions);
}

export function updateD3NetworkGradual(opinions, adjMatrix, edgeWeights, state) {
    if (!opinions || opinions.length === 0 || !adjMatrix || adjMatrix.length === 0 || !state.simulation) return;
    
    // Update node opinions without restarting simulation
    state.nodePositions.forEach((node, i) => {
        if (opinions[i]) {
            node.opinion = opinions[i][0];
        }
    });
    
    const rawLinks = createD3Links(adjMatrix, edgeWeights);
    
    // Convert numeric indices to actual node objects for D3 force simulation
    const newLinks = rawLinks.map(link => ({
        ...link,
        source: state.nodePositions[link.source],
        target: state.nodePositions[link.target]
    }));
    
    // Update link elements without simulation restart
    if (state.linkElements) {
        state.linkElements.data(newLinks)
            .transition()
            .duration(800)
            .ease(d3.easeCubicInOut)
            .attr('stroke-width', d => d.thickness)
            .attr('stroke-opacity', d => d.opacity);
    }
    
    // Update visual elements
    updateElements(state.linkElements, state.nodeElements, newLinks, state.nodePositions, state);
    updateStatisticsDisplay(state.statisticsGroup, opinions);
}

export function updateD3Network(opinions, adjMatrix, edgeWeights, state) {
    if (!opinions || opinions.length === 0 || !adjMatrix || adjMatrix.length === 0 || !state.simulation) return;
    
    // Check if there are significant opinion changes
    const hasSignificantChanges = hasSignificantOpinionChange(opinions, state.previousOpinions, state.significantChangeThreshold);
    
    if (!hasSignificantChanges) {
        // Use gradual update for minor changes
        updateD3NetworkGradual(opinions, adjMatrix, edgeWeights, state);
        return;
    }
    
    // Use full update for significant changes
    state.nodePositions.forEach((node, i) => {
        if (opinions[i]) {
            node.opinion = opinions[i][0];
        }
    });
    
    const rawLinks = createD3Links(adjMatrix, edgeWeights);
    
    // Convert numeric indices to actual node objects for D3 force simulation
    const newLinks = rawLinks.map(link => ({
        ...link,
        source: state.nodePositions[link.source],
        target: state.nodePositions[link.target]
    }));
    
    console.log(`Network update: ${newLinks.length} connections, avg weight: ${newLinks.length > 0 ? (newLinks.reduce((sum, link) => sum + link.weight, 0) / newLinks.length).toFixed(3) : 0}`);
    
    state.simulation.nodes(state.nodePositions);
    state.simulation.force("link").links(newLinks).distance(d => d.distance).strength(d => d.weight * FORCE_CONFIG.linkStrength);
    
    state.simulation.alpha(0.1).restart();
    
    updateElements(state.linkElements, state.nodeElements, newLinks, state.nodePositions, state);
    updateStatisticsDisplay(state.statisticsGroup, opinions);
} 

// === NETWORK LOGIC PORTED FROM PYTHON (network_backend.py) ===

function diag(v) {
    const n = v.length;
    return Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? v[j] : 0))
    );
}

function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
}

function get_r(M, epsilon = 1e-10) {
    return M.map(row => {
        const s = sum(row);
        return row.map(val => val / (s + epsilon));
    });
}

function get_d_norm(M, epsilon = 1e-10) {
    const n = M.length;
    const D = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            D[i][j] = sum(M[i].map((val, idx) => Math.abs(val - M[j][idx])));
        }
    }
    return get_r(D, epsilon);
}

function identity(n) {
    return Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
    );
}

function get_s_norm(M, epsilon = 1e-10) {
    const n = M.length;
    const I = identity(n);
    const d_norm = get_d_norm(M, epsilon);
    const oneMinus = I.map((row, i) => row.map((val, j) => 1 - (val + d_norm[i][j])));
    return get_r(oneMinus, epsilon);
}

function get_row_scaled_matrix(M) {
    const n = M.length;
    const diag_mask = identity(n).map(row => row.map(Boolean));
    const row_min = M.map((row, i) => Math.min(...row.filter((_, j) => i !== j)));
    const row_max = M.map((row, i) => Math.max(...row.filter((_, j) => i !== j)));
    const S = M.map((row, i) => row.map((val, j) => {
        if (i === j) return 0;
        const diff = row_max[i] - row_min[i];
        return (val - row_min[i]) / (diff === 0 ? 1 : diff);
    }));
    return S;
}

function matrixVectorProduct(M, v) {
    return M.map(row => sum(row.map((val, j) => val * v[j][0])));
}

function get_W(s_norm, A) {
    const n = s_norm.length;
    const ones = Array(n).fill(1);
    const sA = s_norm.map((row, i) => row.map((val, j) => val * A[i][j]));
    const sA_ones = sA.map(row => sum(row));
    const diag_sA_ones = diag(sA_ones);
    const I = identity(n);
    // W = s_norm * A + I - diag((s_norm * A) @ ones)
    return sA.map((row, i) => row.map((val, j) => val + I[i][j] - diag_sA_ones[i][j]));
}

function calculate_edge_weights(X) {
    const n = X.length;
    const weights = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i !== j) {
                const opinion_distance = Math.sqrt(sum(X[i].map((val, idx) => (val - X[j][idx]) ** 2)));
                weights[i][j] = 1.0 / (1.0 + opinion_distance);
            } else {
                weights[i][j] = 1.0;
            }
        }
    }
    return weights;
}

function initialize_random_A(n_agents, p, min_connections, user_connections) {
    // Random symmetric adjacency matrix with minimum connections
    let A = Array.from({ length: n_agents }, () => Array(n_agents).fill(0));
    for (let i = 0; i < n_agents; i++) {
        for (let j = i + 1; j < n_agents; j++) {
            if (Math.random() < p) {
                A[i][j] = 1;
                A[j][i] = 1;
            }
        }
    }
    // User hub
    if (user_connections !== null && n_agents > 1) {
        const user_agent_index = 0;
        for (let i = 0; i < n_agents; i++) {
            A[user_agent_index][i] = 0;
            A[i][user_agent_index] = 0;
        }
        const other_agents = Array.from({ length: n_agents - 1 }, (_, i) => i + 1);
        if (other_agents.length > 0) {
            if (user_connections > other_agents.length) throw new Error("user_connections cannot be greater than the number of available agents.");
            const hub_connections = [];
            while (hub_connections.length < user_connections) {
                const idx = other_agents[Math.floor(Math.random() * other_agents.length)];
                if (!hub_connections.includes(idx)) hub_connections.push(idx);
            }
            for (const idx of hub_connections) {
                A[user_agent_index][idx] = 1;
                A[idx][user_agent_index] = 1;
            }
        }
    }
    // Ensure min connections
    for (let i = 1; i < n_agents; i++) {
        let current_connections = sum(A[i]);
        if (current_connections < min_connections) {
            let available_agents = A[i].map((val, idx) => (val === 0 && idx !== i ? idx : null)).filter(x => x !== null);
            if (available_agents.length > 0) {
                let needed = Math.min(min_connections - current_connections, available_agents.length);
                let new_connections = [];
                while (new_connections.length < needed) {
                    const idx = available_agents[Math.floor(Math.random() * available_agents.length)];
                    if (!new_connections.includes(idx)) new_connections.push(idx);
                }
                for (const j of new_connections) {
                    A[i][j] = 1;
                    A[j][i] = 1;
                }
            }
        }
    }
    return A;
}

export class Network {
    constructor(n_agents, X, alpha_filter, user_agents, user_alpha, user_connections, min_connections, A = null, max_opinion_change = 0.1) {
        this.n_agents = n_agents;
        this.alpha_filter = alpha_filter;
        this.max_opinion_change = max_opinion_change;
        this.time_step = 0;
        this.X = X ? X.map(row => [...row]) : Array.from({ length: n_agents }, () => [Math.random()]);
        this.n_user_agents = user_agents.length;
        this.user_agents = user_agents.map((ua, i) => ua ? [...ua] : [...this.X[i]]);
        this.user_alpha = user_alpha;
        for (let i = 0; i < this.n_user_agents; i++) {
            if (!user_agents[i]) {
                this.user_agents[i] = [...this.X[i]];
            } else {
                if (user_agents[i].length !== 1) throw new Error("user_agents[i] must have length 1");
                this.X[i] = [...user_agents[i]];
            }
        }
        this.user_agents = this.user_agents.map(ua => [...ua]);
        this.A = A ? A.map(row => [...row]) : initialize_random_A(this.n_agents, 0.1, min_connections, user_connections);
        this.edge_weights = calculate_edge_weights(this.X);
    }
    get_state() {
        return {
            X: this.X.map(row => [...row]),
            A: this.A.map(row => [...row]),
            time_step: this.time_step,
            edge_weights: this.edge_weights.map(row => [...row])
        };
    }
    set_agent_opinion(agent_index, new_opinion) {
        if (!(0 <= agent_index && agent_index < this.n_agents)) throw new Error(`Agent index ${agent_index} is out of bounds.`);
        if (!Array.isArray(new_opinion)) new_opinion = [new_opinion];
        if (new_opinion.length !== 1) throw new Error(`Opinion vector shape mismatch. Expected (1,), got (${new_opinion.length},)`);
        this.X[agent_index] = [...new_opinion];
    }
    add_user_opinion(opinion, user_index = 0) {
        if (!(0 <= user_index && user_index < this.n_user_agents)) throw new Error("user_index out of bounds");
        const smoothed = this.user_alpha * opinion[0] + (1 - this.user_alpha) * this.user_agents[user_index][0];
        this.user_agents[user_index][0] = smoothed;
        this.set_agent_opinion(user_index, [smoothed]);
    }
    update_network(include_user_opinions = true) {
        const s_norm = get_s_norm(this.X);
        let adjusted_A = this.A.map(row => [...row]);
        if (!include_user_opinions) {
            for (let i = 0; i < this.n_user_agents; i++) {
                for (let j = 0; j < this.n_agents; j++) {
                    adjusted_A[i][j] = 0;
                    adjusted_A[j][i] = 0;
                }
            }
        }
        // Matrix multiplication: get_W(s_norm, adjusted_A) @ this.X
        const W = get_W(s_norm, adjusted_A);
        const new_X = matrixVectorProduct(W, this.X).map(x => [x]);
        // Update opinions with alpha filter and maximum change constraint
        this.X = this.X.map((row, i) => {
            const alpha_filtered_opinion = this.alpha_filter * new_X[i][0] + (1 - this.alpha_filter) * row[0];
            const current_opinion = row[0];
            const opinion_change = alpha_filtered_opinion - current_opinion;
            const constrained_change = Math.max(-this.max_opinion_change, Math.min(this.max_opinion_change, opinion_change));
            return [current_opinion + constrained_change];
        });
        this.time_step += 1;
        if (this.n_user_agents > 0) {
            for (let i = 0; i < this.n_user_agents; i++) {
                this.X[i] = [...this.user_agents[i]];
            }
        }
        this.edge_weights = calculate_edge_weights(this.X);
        return this.get_state();
    }
} 