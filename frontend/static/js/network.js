import { FORCE_CONFIG, getShirtColorFromOpinion } from './utils.js';
import { generateAvatarData, drawAvatar } from './avatars.js';
import { createStatisticsDisplay, updateStatisticsDisplay, createOpinionAxis } from './ui-components.js';

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

export function updateD3Network(opinions, adjMatrix, edgeWeights, state) {
    if (!opinions || opinions.length === 0 || !adjMatrix || adjMatrix.length === 0 || !state.simulation) return;
    
    state.nodePositions.forEach((node, i) => {
        if (opinions[i]) {
            node.opinion = opinions[i][0];
        }
    });
    
    const newLinks = createD3Links(adjMatrix, edgeWeights);
    console.log(`Network update: ${newLinks.length} connections, avg weight: ${newLinks.length > 0 ? (newLinks.reduce((sum, link) => sum + link.weight, 0) / newLinks.length).toFixed(3) : 0}`);
    
    state.simulation.nodes(state.nodePositions);
    state.simulation.force("link").links(newLinks).distance(d => d.distance).strength(d => d.weight * FORCE_CONFIG.linkStrength);
    
    state.simulation.alpha(0.1).restart();
    
    state.simulation.force('opinion_cluster').strength(2.8);
    
    setTimeout(() => {
        if (state.simulation) {
            state.simulation.force('opinion_cluster').strength(FORCE_CONFIG.opinionStrength);
        }
    }, 8000);
    
    updateElements(state.linkElements, state.nodeElements, newLinks, state.nodePositions, state);
    updateStatisticsDisplay(state.statisticsGroup, opinions);
} 