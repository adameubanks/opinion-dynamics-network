// Preselected user responses for GitHub Pages version (no API key needed)
export const PRESELECTED_RESPONSES = [
    // Strongly against pineapple on pizza (0.0-0.2)
    {
        text: "Absolutely not! Pineapple on pizza is a crime against humanity! 🍍🚫",
        sentiment: [0.05],
        category: "Strongly Against"
    },
    {
        text: "Pineapple on pizza should be illegal. It's disgusting!",
        sentiment: [0.1],
        category: "Strongly Against"
    },
    {
        text: "I'd rather eat cardboard than pineapple pizza.",
        sentiment: [0.15],
        category: "Strongly Against"
    },
    {
        text: "Pineapple doesn't belong on pizza. Period.",
        sentiment: [0.2],
        category: "Strongly Against"
    },
    
    // Against pineapple on pizza (0.2-0.4)
    {
        text: "I don't like pineapple on pizza. It's just wrong.",
        sentiment: [0.25],
        category: "Against"
    },
    {
        text: "Pineapple on pizza is weird. I'll pass.",
        sentiment: [0.3],
        category: "Against"
    },
    {
        text: "Not a fan of pineapple on pizza. Too sweet for me.",
        sentiment: [0.35],
        category: "Against"
    },
    {
        text: "I tried pineapple pizza once. Never again.",
        sentiment: [0.4],
        category: "Against"
    },
    
    // Neutral/Undecided (0.4-0.6)
    {
        text: "I'm not sure about pineapple on pizza. Maybe?",
        sentiment: [0.45],
        category: "Neutral"
    },
    {
        text: "Pineapple on pizza? I don't have strong feelings either way.",
        sentiment: [0.5],
        category: "Neutral"
    },
    {
        text: "Sometimes pineapple pizza is okay, sometimes it's not.",
        sentiment: [0.55],
        category: "Neutral"
    },
    {
        text: "I'm on the fence about pineapple pizza.",
        sentiment: [0.6],
        category: "Neutral"
    },
    
    // For pineapple on pizza (0.6-0.8)
    {
        text: "I actually kind of like pineapple on pizza!",
        sentiment: [0.65],
        category: "For"
    },
    {
        text: "Pineapple pizza is pretty good, not gonna lie.",
        sentiment: [0.7],
        category: "For"
    },
    {
        text: "I'm a fan of pineapple on pizza. Sweet and savory!",
        sentiment: [0.75],
        category: "For"
    },
    {
        text: "Pineapple pizza is delicious! Don't knock it till you try it.",
        sentiment: [0.8],
        category: "For"
    },
    
    // Strongly for pineapple on pizza (0.8-1.0)
    {
        text: "Pineapple on pizza is AMAZING! 🍍🍕❤️",
        sentiment: [0.85],
        category: "Strongly For"
    },
    {
        text: "I LOVE pineapple pizza! It's the best topping ever!",
        sentiment: [0.9],
        category: "Strongly For"
    },
    {
        text: "Pineapple pizza is life! I could eat it every day! 🍍✨",
        sentiment: [0.95],
        category: "Strongly For"
    },
    {
        text: "Pineapple on pizza is PERFECTION! Fight me! 🍕🔥",
        sentiment: [1.0],
        category: "Strongly For"
    }
];

export function getResponseByCategory(category) {
    return PRESELECTED_RESPONSES.filter(response => response.category === category);
}

export function getRandomResponse() {
    return PRESELECTED_RESPONSES[Math.floor(Math.random() * PRESELECTED_RESPONSES.length)];
} 