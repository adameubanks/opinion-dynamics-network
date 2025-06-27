export const AVATAR_CONFIG = {
    hairColors: ['#8B4513', '#FFD700', '#000000', '#FF6347', '#9370DB'],
    skinColors: ['#FDBCB4', '#F1C27D', '#E0AC69', '#C68642', '#8D5524'],
    expressions: ['happy', 'neutral', 'concerned', 'excited', 'thoughtful']
};

export const OPINION_THRESHOLDS = {
    0: '🍍+🍕=💀',    // 0.00–0.05
    1: '🍍+🍕=🤮',    // 0.05–0.10
    2: '🍍+🍕=😱',    // 0.10–0.15
    3: '🍍+🍕=🤢',    // 0.15–0.20
    4: '🍍+🍕=😡',    // 0.20–0.25
    5: '🍍+🍕=😤',    // 0.25–0.30
    6: '🍍+🍕=🙅',    // 0.30–0.35
    7: '🍍+🍕=😒',    // 0.35–0.40
    8: '🍍+🍕=🤨',    // 0.40–0.425 (skeptical)
    9: '🍍+🍕=🤷',    // 0.425–0.45 (shrug)
    10: '🍍+🍕=🫤',   // 0.45–0.475 (meh)
    11: '🍍+🍕=🤔',   // 0.475–0.50 (thinking)
    12: '🍍+🍕=🫣',   // 0.50–0.525 (peeking)
    13: '🍍+🍕=🧐',   // 0.525–0.55 (inspecting)
    14: '🍍+🍕=😬',   // 0.55–0.575 (awkward smile)
    15: '🍍+🍕=🙂',   // 0.575–0.60 (slight smile)
    16: '🍍+🍕=😌',   // 0.60–0.65
    17: '🍍+🍕=😋',   // 0.65–0.70
    18: '🍍+🍕=😊',   // 0.70–0.75
    19: '🍍+🍕=😍',   // 0.75–0.80
    20: '🍍+🍕=🤤',   // 0.80–0.85
    21: '🍍+🍕=🔥',   // 0.85–0.90
    22: '🍍+🍕=🎉',   // 0.90–1.00
    23: '🍍+🍕=👑'    // 1.00 exactly
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