import { calculateOpinionStatistics, OPINION_THRESHOLDS } from './utils.js';

export function createStatisticsDisplay(svg, width) {
    const statsGroup = svg.append('g')
        .attr('class', 'statistics-display')
        .attr('transform', 'translate(15, 15)');
    
    // Background box
    statsGroup.append('rect')
        .attr('class', 'stats-background')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', 280)
        .attr('height', 130)
        .attr('rx', 8)
        .attr('fill', 'rgba(30, 30, 30, 0.85)')
        .attr('stroke', '#3a3a3a')
        .attr('stroke-width', 1);
    
    // Text elements with initial values
    const textElements = [
        { class: 'consensus-text', x: 15, y: 30, fontSize: '20px', content: [
            { text: 'Consensus: ', fontWeight: 'bold' },
            { text: '🍍+🍕=🤷', class: 'consensus-content' }
        ]},
        { class: 'mean-text', x: 15, y: 52, fontSize: '16px', fill: '#b0b0b0', text: 'Mean: 0.50' },
        { class: 'polarization-text', x: 15, y: 82, fontSize: '20px', content: [
            { text: 'Polarization: ', fontWeight: 'bold' },
            { text: 'Low', class: 'polarization-content' }
        ]},
        { class: 'std-text', x: 15, y: 104, fontSize: '16px', fill: '#b0b0b0', text: 'Standard Deviation: 0.00' }
    ];

    textElements.forEach(elem => {
        const textEl = statsGroup.append('text')
            .attr('class', elem.class)
            .attr('x', elem.x)
            .attr('y', elem.y)
            .attr('fill', elem.fill || '#e0e0e0')
            .attr('font-family', 'Arial, sans-serif')
            .attr('font-size', elem.fontSize);

        if (elem.content) {
            elem.content.forEach(span => {
                const tspan = textEl.append('tspan');
                if (span.fontWeight) tspan.attr('font-weight', span.fontWeight);
                if (span.class) tspan.attr('class', span.class);
                tspan.text(span.text);
            });
        } else {
            textEl.text(elem.text);
        }
    });
    
    return statsGroup;
}

export function updateStatisticsDisplay(statsGroup, opinions) {
    if (!statsGroup || !opinions || opinions.length === 0) return;
    
    const stats = calculateOpinionStatistics(opinions);
    const emojiIndex = Math.min(10, Math.floor(stats.mean * 10));
    const emoji = OPINION_THRESHOLDS[emojiIndex];
    
    const updates = [
        { selector: '.consensus-content', text: emoji },
        { selector: '.mean-text', text: `Mean: ${stats.mean.toFixed(2)}` },
        { selector: '.polarization-content', text: stats.polarizationLevel },
        { selector: '.std-text', text: `Standard Deviation: ${stats.std.toFixed(2)}` }
    ];

    updates.forEach(update => {
        statsGroup.select(update.selector)
            .transition()
            .duration(800)
            .ease(d3.easeCubicInOut)
            .text(update.text);
    });
}

export function createOpinionAxis(svg, width, height) {
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
        .attr('id', 'opinion-gradient')
        .attr('x1', '0%').attr('x2', '100%').attr('y1', '0%').attr('y2', '0%');
    
    const gradientStops = [
        { offset: '0%', color: '#FF6B6B' },
        { offset: '50%', color: '#95A5A6' },
        { offset: '100%', color: '#4ECDC4' }
    ];
    
    gradientStops.forEach(stop => {
        gradient.append('stop').attr('offset', stop.offset).attr('stop-color', stop.color);
    });
    
    const axisY = height - 60;
    const startX = width * 0.05;
    const endX = width * 0.95;
    const arrowWidth = 45;
    const axisHeight = 20;
    const arrowHeight = 40;
    
    const axisGroup = svg.append('g').attr('class', 'opinion-axis');
    
    // Main gradient bar
    axisGroup.append('rect')
        .attr('x', startX).attr('y', axisY - axisHeight / 2)
        .attr('width', endX - startX).attr('height', axisHeight)
        .attr('rx', 10).attr('fill', 'url(#opinion-gradient)')
        .attr('stroke', '#3a3a3a').attr('stroke-width', 1);
    
    // Arrows and labels
    const arrows = [
        { points: [[startX - 15, axisY], [startX + arrowWidth - 15, axisY - arrowHeight / 2], [startX + arrowWidth - 15, axisY + arrowHeight / 2]], fill: '#FF6B6B', label: 'Anti Pineapple Pizza', x: startX + arrowWidth / 2 - 15 },
        { points: [[endX + 15, axisY], [endX - arrowWidth + 15, axisY - arrowHeight / 2], [endX - arrowWidth + 15, axisY + arrowHeight / 2]], fill: '#4ECDC4', label: 'Pro Pineapple Pizza', x: endX - arrowWidth / 2 + 15 }
    ];
    
    arrows.forEach(arrow => {
        axisGroup.append('polygon')
            .attr('points', arrow.points.map(d => d.join(',')).join(' '))
            .attr('fill', arrow.fill);
        
        axisGroup.append('text')
            .attr('x', arrow.x).attr('y', axisY + arrowHeight / 2 + 25)
            .attr('text-anchor', 'middle').attr('font-family', 'Arial, sans-serif')
            .attr('font-size', '18px').attr('font-weight', 'bold')
            .attr('fill', '#e0e0e0').text(arrow.label);
    });
    
    return axisGroup;
}

export function showSpeechBubble(nodeElement, message) {
    console.log('Showing bubble for:', message);
    nodeElement.raise();
    
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
    const bubbleWidth = maxCharsPerLine * 11 + bubblePadding * 2;

    const bubbleGroup = nodeElement.append('g')
        .attr('class', 'speech-bubble')
        .attr('transform', `translate(${-bubbleWidth / 2}, ${-bubbleHeight - 75})`);

    const r = 8;
    const tailHeight = 10;
    const tailWidth = 20;
    const pathData = `M ${r},0 H ${bubbleWidth - r} A ${r},${r} 0 0 1 ${bubbleWidth},${r} V ${bubbleHeight - r} A ${r},${r} 0 0 1 ${bubbleWidth - r},${bubbleHeight} H ${bubbleWidth / 2 + tailWidth / 2} L ${bubbleWidth / 2},${bubbleHeight + tailHeight} L ${bubbleWidth / 2 - tailWidth / 2},${bubbleHeight} H ${r} A ${r},${r} 0 0 1 0,${bubbleHeight - r} V ${r} A ${r},${r} 0 0 1 ${r},0 Z`;

    bubbleGroup.append('path')
        .attr('d', pathData)
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

    // Fade in and out
    bubbleGroup.transition().duration(600).ease(d3.easeCubicInOut).style('opacity', 1);
    bubbleGroup.transition().delay(5000).duration(1000).ease(d3.easeCubicInOut).style('opacity', 0).remove();
} 