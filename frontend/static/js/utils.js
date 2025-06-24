export const AVATAR_CONFIG = {
    hairColors: ['#8B4513', '#FFD700', '#000000', '#FF6347', '#9370DB'],
    skinColors: ['#FDBCB4', '#F1C27D', '#E0AC69', '#C68642', '#8D5524'],
    expressions: ['happy', 'neutral', 'concerned', 'excited', 'thoughtful']
};

export const OPINION_THRESHOLDS = {
    0: '🍍+🍕=💀',    // 0.00-0.05 (absolutely hate it)
    1: '🍍+🍕=🤮',    // 0.05-0.10 (disgusting)
    2: '🍍+🍕=😱',    // 0.10-0.15 (shocked/horrified)
    3: '🍍+🍕=🤢',    // 0.15-0.20 (nauseated)
    4: '🍍+🍕=😡',    // 0.20-0.25 (angry)
    5: '🍍+🍕=😤',    // 0.25-0.30 (huffing with anger)
    6: '🍍+🍕=🙅',    // 0.30-0.35 (rejection gesture)
    7: '🍍+🍕=😒',    // 0.35-0.40 (unamused)
    8: '🍍+🍕=🤨',    // 0.40-0.45 (suspicious/skeptical)
    9: '🍍+🍕=🤷',    // 0.45-0.50 (neutral zone start)
    10: '🍍+🍕=🤷',   // 0.50-0.55 (neutral zone end)
    11: '🍍+🍕=🤔',   // 0.55-0.60 (thinking/considering)
    12: '🍍+🍕=🙂',   // 0.60-0.65 (slightly smiling)
    13: '🍍+🍕=😌',   // 0.65-0.70 (relieved/content)
    14: '🍍+🍕=😋',   // 0.70-0.75 (savoring)
    15: '🍍+🍕=😊',   // 0.75-0.80 (happy)
    16: '🍍+🍕=😍',   // 0.80-0.85 (heart eyes)
    17: '🍍+🍕=🤤',   // 0.85-0.90 (drooling)
    18: '🍍+🍕=🔥',   // 0.90-0.95 (fire/amazing)
    19: '🍍+🍕=🎉',   // 0.95-1.00 (celebration)
    20: '🍍+🍕=👑'    // 1.00 exactly (perfect/royal)
};

export const FORCE_CONFIG = {
    linkStrength: 0.1,
    chargeStrength: -500,
    collisionRadius: 38,
    opinionStrength: 2.5,
    yCenteringStrength: 0.1
};

export function getShirtColorFromOpinion(opinion) {
    if (opinion < 0.45) return '#FF6B6B';
    if (opinion > 0.55) return '#4ECDC4';
    return '#95A5A6';
}

export function calculateOpinionStatistics(opinions) {
    if (!opinions || opinions.length === 0) {
        return { mean: 0.5, std: 0, polarizationLevel: 'Low' };
    }
    
    const values = opinions.map(opinion => opinion[0]);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    
    let polarizationLevel;
    if (std < 0.10) {
        polarizationLevel = 'Low';
    } else if (std < 0.20) {
        polarizationLevel = 'Medium';
    } else {
        polarizationLevel = 'High';
    }
    
    return { mean, std, polarizationLevel };
} 