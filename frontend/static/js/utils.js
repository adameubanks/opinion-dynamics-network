export const AVATAR_CONFIG = {
    hairColors: ['#8B4513', '#FFD700', '#000000', '#FF6347', '#9370DB'],
    skinColors: ['#FDBCB4', '#F1C27D', '#E0AC69', '#C68642', '#8D5524'],
    expressions: ['happy', 'neutral', 'concerned', 'excited', 'thoughtful']
};

export const OPINION_THRESHOLDS = {
    0: '🍍+🍕=💀',
    1: '🍍+🍕=🤮', 
    2: '🍍+🍕=😡',
    3: '🍍+🍕=🙅',
    4: '🍍+🍕=🤨',
    5: '🍍+🍕=🤷',
    6: '🍍+🍕=🤔',
    7: '🍍+🍕=😋',
    8: '🍍+🍕=😍',
    9: '🍍+🍕=🔥',
    10: '🍍+🍕=👑'
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