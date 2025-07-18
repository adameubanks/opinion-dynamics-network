import { AVATAR_CONFIG, getShirtColorFromOpinion } from './utils.js';

export function generateAvatarData(agentCount) {
    const avatars = [];
    for (let i = 0; i < agentCount; i++) {
        avatars.push({
            hairColor: AVATAR_CONFIG.hairColors[i % AVATAR_CONFIG.hairColors.length],
            skinColor: AVATAR_CONFIG.skinColors[(Math.floor(i / AVATAR_CONFIG.hairColors.length)) % AVATAR_CONFIG.skinColors.length],
            expression: AVATAR_CONFIG.expressions[Math.floor(Math.random() * AVATAR_CONFIG.expressions.length)],
        });
    }
    return avatars;
}

export function drawAvatar(selection, avatarConfig, agentIndex, opinion = 0.5, userAgentIndex) {
    const scaleFactor = 2.5;
    const avatarGroup = selection.append('g')
        .attr('class', 'avatar')
        .attr('transform', `translate(-${20 * scaleFactor}, -${20 * scaleFactor})`);

    // Avatar parts configuration
    const parts = [
        { type: 'circle', class: 'avatar-head', cx: 20 * scaleFactor, cy: 15 * scaleFactor, r: 12 * scaleFactor, fill: avatarConfig.skinColor, stroke: '#333', 'stroke-width': 1 * scaleFactor },
        { type: 'circle', cx: 16 * scaleFactor, cy: 13 * scaleFactor, r: 1.5 * scaleFactor, fill: '#000' },
        { type: 'circle', cx: 24 * scaleFactor, cy: 13 * scaleFactor, r: 1.5 * scaleFactor, fill: '#000' },
        { type: 'path', d: `M${8 * scaleFactor},${9 * scaleFactor} Q${20 * scaleFactor},${-5 * scaleFactor} ${32 * scaleFactor},${9 * scaleFactor} Z`, fill: avatarConfig.hairColor },
        { type: 'rect', class: 'avatar-body', x: 10 * scaleFactor, y: 27 * scaleFactor, width: 20 * scaleFactor, height: 15 * scaleFactor, fill: getShirtColorFromOpinion(opinion), stroke: '#333', 'stroke-width': 1 * scaleFactor, rx: 3 * scaleFactor }
    ];

    // Draw all parts
    parts.forEach(part => {
        const element = avatarGroup.append(part.type);
        Object.keys(part).forEach(attr => {
            if (attr !== 'type') {
                element.attr(attr, part[attr]);
            }
        });
    });

    // Add mouth based on expression
    const mouthPaths = {
        happy: `M ${16 * scaleFactor} ${18 * scaleFactor} Q ${20 * scaleFactor} ${22 * scaleFactor} ${24 * scaleFactor} ${18 * scaleFactor}`,
        concerned: `M ${16 * scaleFactor} ${20 * scaleFactor} Q ${20 * scaleFactor} ${16 * scaleFactor} ${24 * scaleFactor} ${20 * scaleFactor}`,
        excited: `M ${16 * scaleFactor} ${17 * scaleFactor} Q ${20 * scaleFactor} ${23 * scaleFactor} ${24 * scaleFactor} ${17 * scaleFactor}`,
        neutral: `M ${16 * scaleFactor} ${19 * scaleFactor} L ${24 * scaleFactor} ${19 * scaleFactor}`
    };

    avatarGroup.append('path')
        .attr('class', 'mouth')
        .attr('d', mouthPaths[avatarConfig.expression] || mouthPaths.neutral)
        .attr('stroke', '#333')
        .attr('stroke-width', 1 * scaleFactor)
        .attr('fill', 'none');
    
    // Add "YOU" label for user's avatar
    if (agentIndex === userAgentIndex) {
        avatarGroup.append('text')
            .attr('class', 'user-label')
            .attr('x', 20 * scaleFactor)
            .attr('y', 50 * scaleFactor)
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