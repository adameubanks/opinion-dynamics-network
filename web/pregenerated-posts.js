// Pregenerated posts ported from pre_generated_posts.py

// Beta distribution sampling using Marsaglia and Tsang's method
function betaSample(alpha, beta) {
    // Use rejection sampling for beta distribution
    const maxIterations = 1000;
    for (let i = 0; i < maxIterations; i++) {
        const u1 = Math.random();
        const u2 = Math.random();
        
        // Transform to beta distribution
        const x = Math.pow(u1, 1 / alpha);
        const y = Math.pow(u2, 1 / beta);
        
        if (x + y <= 1) {
            return x / (x + y);
        }
    }
    // Fallback to uniform distribution
    return Math.random();
}

export const OPINION_POSTS = {
    "0.0-0.1": [
        { text: "Anyone caught putting pineapple on pizza should be reported to the Honor Code Office.", sentiment: [0.01] },
        { text: "Pineapple on pizza is an abomination. Y'all need therapy. 🍍🚫", sentiment: [0.02] },
        { text: "I'd rather retake American Heritage than eat pineapple on pizza.", sentiment: [0.05] },
        { text: "Pineapple on pizza? That's how you get unfriended IRL. 🫠", sentiment: [0.09] },
        { text: "Just watched someone eat Hawaiian pizza and now I need a support group.", sentiment: [0.07] },
        { text: "Putting pineapple on pizza is how civilizations fall.", sentiment: [0.03] },
        { text: "If you like pineapple on pizza, don't talk to me until you've repented.", sentiment: [0.08] },
        { text: "There should be a warning label on Hawaiian pizza. Like: 'May cause moral decay.'", sentiment: [0.04] }
    ],
    "0.1-0.2": [
        { text: "Hot take: pineapple on pizza is culinary apostasy. 🔥🍕", sentiment: [0.11] },
        { text: "I trust people less if they like pineapple on pizza. Just saying.", sentiment: [0.18] },
        { text: "It's not just bad - it's morally wrong. Pineapple doesn't belong there!", sentiment: [0.12] },
        { text: "Pineapple on pizza is why aliens won't talk to us.", sentiment: [0.17] },
        { text: "Pineapple is a dessert, not a topping. Fight me.", sentiment: [0.18] }
    ],
    "0.2-0.3": [
        { text: "Tried pineapple pizza once after Devotional. Bad idea. Spirit left immediately. 💀", sentiment: [0.28] },
        { text: "I'll eat it to be polite, but I'm praying someone else finishes it first.", sentiment: [0.27] },
        { text: "I don't hate it, but if there's any other option, I'm taking that.", sentiment: [0.23] },
        { text: "It's not for me. I like my pizza savory, not... confused.", sentiment: [0.28] },
        { text: "Not the worst thing ever, but also not what pizza should be.", sentiment: [0.29] },
        { text: "Feels like a betrayal in crust form.", sentiment: [0.27] },
        { text: "I tried to like it, but I just can't get past the sweetness.", sentiment: [0.26] }
    ],
    "0.3-0.4": [
        { text: "Look, I'll eat it if it's the only thing left at the party. But I'm not happy about it.", sentiment: [0.35] },
        { text: "Tried pineapple pizza once. Didn't throw up. Didn't smile either.", sentiment: [0.38] },
        { text: "It's not *that* bad, but still a little cursed.", sentiment: [0.33] },
        { text: "It's edible. That's about the nicest thing I can say.", sentiment: [0.31] },
        { text: "I'll eat it. But only after all the cheese and pepperoni are gone.", sentiment: [0.39] },
        { text: "I've had worse. But not often.", sentiment: [0.34] }
    ],
    "0.4-0.5": [
        { text: "Pineapple on pizza? Meh. Not a hill I'm willing to die on.", sentiment: [0.45] },
        { text: "It's like elevator music for your taste buds.", sentiment: [0.48] },
        { text: "Some bites work, some don't. It's like pineapple roulette.", sentiment: [0.44] },
        { text: "It's weird, but I get it. Like Crocs for your mouth.", sentiment: [0.46] },
        { text: "I used to hate it, now I just mildly question it.", sentiment: [0.42] },
        { text: "The pineapple part is good. The pizza part is good. Together? Eh.", sentiment: [0.49] },
        { text: "I don't understand the hype or the hate. It's just food, guys.", sentiment: [0.43] },
        { text: "Wouldn't order it. Wouldn't cry if it showed up.", sentiment: [0.44] }
    ],
    "0.5-0.6": [
        { text: "It's okay! Not my go-to, but I won't say no either.", sentiment: [0.58] },
        { text: "If you pair it with the right sauce and crust, it's not bad at all.", sentiment: [0.51] },
        { text: "Honestly? It kinda grows on you after a few bites.", sentiment: [0.57] },
        { text: "Not my first choice, but I respect the flavor adventure.", sentiment: [0.54] },
        { text: "I wouldn't recommend it... but I wouldn't stop you either.", sentiment: [0.53] },
        { text: "I used to judge people for liking it. Now I just nod slowly.", sentiment: [0.52] },
        { text: "Pineapple pizza isn't great. But it's interesting. And sometimes that's enough.", sentiment: [0.55] },
        { text: "I'd eat it if someone else paid for it. That's where I'm at.", sentiment: [0.50] },
        { text: "Pineapple on pizza? As long as we pray first.", sentiment: [0.56] },
        { text: "Might bring a Hawaiian pizza to ward prayer just to test testimonies.", sentiment: [0.58] },
        { text: "You know what? There's something kinda rebellious about liking it.", sentiment: [0.55] }
    ],
    "0.6-0.7": [
        { text: "Lowkey enjoy pineapple on pizza. Might bring one to the next break the fast just to see what happens.", sentiment: [0.61] },
        { text: "Unpopular opinion: Hawaiian pizza is better than most Mutual dates. 🍕❤️", sentiment: [0.68] },
        { text: "Pineapple pizza slaps. Fights welcome in the MARB after class. 👊🍍", sentiment: [0.66] },
        { text: "Honestly, pineapple adds a vibe. Don't @ me.", sentiment: [0.65] },
        { text: "Was skeptical at first, but now I kinda crave it sometimes.", sentiment: [0.69] },
        { text: "Unexpectedly good combo. The tang hits just right. 🍍🔥", sentiment: [0.66] }
    ],
    "0.7-0.8": [
        { text: "Hawaiian pizza got me through finals.", sentiment: [0.75] },
        { text: "Pineapple pizza supremacy. You all just don't have the palate.", sentiment: [0.78] },
        { text: "Sweet, salty, cheesy, doughy — it's a flavor symphony. 🎶", sentiment: [0.73] },
        { text: "Pineapple on pizza is criminally underrated. I will die on this hill.", sentiment: [0.76] },
        { text: "Call me a food heretic, but pineapple belongs on pizza and I stand by that.", sentiment: [0.72] },
        { text: "If you think pineapple ruins pizza, maybe joy just isn't your thing.", sentiment: [0.79] },
        { text: "It's not just a topping. It's a lifestyle choice I'm proud of.", sentiment: [0.71] }
    ],
    "0.8-0.9": [
        { text: "Pineapple on pizza is proof God wants us to be happy. 🍕✨", sentiment: [0.85] },
        { text: "The perfect bite: melty cheese, ham, and pineapple. Don't talk to me unless you've tried it.", sentiment: [0.85] },
        { text: "Pineapple on pizza is elite. Elite. Y'all are just scared of flavor.", sentiment: [0.87] },
        { text: "Haters gonna hate, but pineapple pizza is top tier. 🍍💅", sentiment: [0.82] },
        { text: "People who hate pineapple pizza fear complexity. Grow up.", sentiment: [0.88] },
        { text: "When I say I love pineapple pizza, I mean it with my whole soul.", sentiment: [0.86] },
        { text: "One bite of pineapple pizza and suddenly life makes sense.", sentiment: [0.83] },
        { text: "Pineapple on pizza is the best thing since sliced bread. 🍍🍞", sentiment: [0.84] }
    ],
    "0.9-1.0": [
        { text: "Hawaiian pizza is celestial-tier cuisine.", sentiment: [0.91] },
        { text: "If loving pineapple pizza is wrong, then I don't want to be right.", sentiment: [0.97] },
        { text: "If you bring pineapple pizza to a ward activity, I'm marrying you.", sentiment: [0.99] },
        { text: "Hawaiian pizza healed my trust issues. It's that deep.", sentiment: [0.92] },
        { text: "One bite of pineapple pizza and I knew joy was real.", sentiment: [0.95] },
        { text: "Can't trust anyone who doesn't like pineapple pizza. That's my love language.", sentiment: [0.91] },
        { text: "The celestial kingdom better have Hawaiian pizza or I'm rebelling.", sentiment: [0.98] },
        { text: "No cap, pineapple pizza changed my life. I'm emotional just thinking about it.", sentiment: [0.99] }
    ]
};

export function getPostForOpinion(opinion) {
    const POST_SELECTION_CONCENTRATION = 50.0;
    const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
    const clamped_opinion = clamp(opinion, 0.001, 0.999);
    const alpha = clamped_opinion * POST_SELECTION_CONCENTRATION;
    const beta = (1 - clamped_opinion) * POST_SELECTION_CONCENTRATION;
    const sampled_opinion = betaSample(alpha, beta);
    
    // Define opinion ranges as tuples for matching Python structure
    const opinionRanges = [
        [0.0, 0.1], [0.1, 0.2], [0.2, 0.3], [0.3, 0.4], [0.4, 0.5],
        [0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.0]
    ];
    
    for (const [min_val, max_val] of opinionRanges) {
        if (sampled_opinion >= min_val && sampled_opinion < max_val) {
            const key = `${min_val.toFixed(1)}-${max_val.toFixed(1)}`;
            const posts = OPINION_POSTS[key];
            if (posts && posts.length > 0) {
                return posts[Math.floor(Math.random() * posts.length)];
            }
        }
    }
    
    // Fallback for the case where sampled_opinion is exactly 1.0
    if (sampled_opinion === 1.0) {
        const posts = OPINION_POSTS["0.9-1.0"];
        return posts[Math.floor(Math.random() * posts.length)];
    }
    
    // Fallback
    const posts = OPINION_POSTS["0.0-0.1"];
    return posts[Math.floor(Math.random() * posts.length)];
} 