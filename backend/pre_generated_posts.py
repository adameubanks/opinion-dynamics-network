import numpy as np
from typing import List, Dict, Tuple
import random

OPINION_POSTS: Dict[Tuple[float, float], List[Dict[str, any]]] = {
    (0.0, 0.1): [
        {"text": "Anyone caught putting pineapple on pizza should be reported to the Honor Code Office.", "sentiment": [0.01]},
        {"text": "Pineapple on pizza is an abomination. Y'all need therapy. 🍍🚫", "sentiment": [0.02]},
        {"text": "I'd rather retake American Heritage than eat pineapple on pizza.", "sentiment": [0.05]},
        {"text": "Pineapple on pizza? That's how you get unfriended IRL. 🫠", "sentiment": [0.09]},
        {"text": "Just watched someone eat Hawaiian pizza and now I need a support group.", "sentiment": [0.07]}
    ],
    (0.1, 0.2): [
        {"text": "Hot take: pineapple on pizza is culinary apostasy. 🔥🍕", "sentiment": [0.11]},
        {"text": "I trust people less if they like pineapple on pizza. Just saying.", "sentiment": [0.18]},
        {"text": "It's not just bad - it's morally wrong. Pineapple doesn't belong there!", "sentiment": [0.12]},
        {"text": "Pineapple is a dessert, not a topping. Fight me.", "sentiment": [0.18]}
    ],
    (0.2, 0.3): [
        {"text": "Tried pineapple pizza once after Devotional. Bad idea. Spirit left immediately. 💀", "sentiment": [0.28]},
        {"text": "I'll eat it to be polite, but I'm praying someone else finishes it first.", "sentiment": [0.27]},
        {"text": "I don't hate it, but if there's any other option, I'm taking that.", "sentiment": [0.23]},
        {"text": "It's not for me. I like my pizza savory, not... confused.", "sentiment": [0.28]},
        {"text": "I tried to like it, but I just can't get past the sweetness.", "sentiment": [0.26]}
    ],
    (0.3, 0.4): [
        {"text": "Look, I'll eat it if it's the only thing left at the party. But I'm not happy about it.", "sentiment": [0.35]},
        {"text": "Tried pineapple pizza once. Didn't throw up. Didn't smile either.", "sentiment": [0.38]},
        {"text": "It's not *that* bad, but still a little cursed.", "sentiment": [0.33]}
    ],
    (0.4, 0.5): [
        {"text": "Pineapple on pizza? Meh. Not a hill I'm willing to die on.", "sentiment": [0.45]},
        {"text": "It's like elevator music for your taste buds.", "sentiment": [0.48]},
        {"text": "Some bites work, some don't. It's like pineapple roulette.", "sentiment": [0.44]},
        {"text": "I used to hate it, now I just mildly question it.", "sentiment": [0.42]},
        {"text": "The pineapple part is good. The pizza part is good. Together? Eh.", "sentiment": [0.49]},
        {"text": "I don't understand the hype or the hate. It's just food, guys.", "sentiment": [0.43]},
        {"text": "Wouldn't order it. Wouldn't cry if it showed up.", "sentiment": [0.44]},
    ],

    (0.5, 0.6): [
        {"text": "It's okay! Not my go-to, but I won't say no either.", "sentiment": [0.58]},
        {"text": "If you pair it with the right sauce and crust, it's not bad at all.", "sentiment": [0.51]},
        {"text": "Honestly? It kinda grows on you after a few bites.", "sentiment": [0.57]},
        {"text": "Not my first choice, but I respect the flavor adventure.", "sentiment": [0.54]},
        {"text": "I wouldn't recommend it... but I wouldn't stop you either.", "sentiment": [0.53]},
        {"text": "I used to judge people for liking it. Now I just nod slowly.", "sentiment": [0.52]},
        {"text": "Pineapple pizza isn't great. But it's interesting. And sometimes that's enough.", "sentiment": [0.55]},
        {"text": "I'd eat it if someone else paid for it. That's where I'm at.", "sentiment": [0.50]},
        {"text": "Pineapple on pizza? As long as we pray first.", "sentiment": [0.56]},
        {"text": "Might bring a Hawaiian pizza to ward prayer just to test testimonies.", "sentiment": [0.58]},
    ],
    (0.6, 0.7): [
        {"text": "Lowkey enjoy pineapple on pizza. Might bring one to the next break the fast just to see what happens.", "sentiment": [0.61]},
        {"text": "Unpopular opinion: Hawaiian pizza is better than most Mutual dates. 🍕❤️", "sentiment": [0.68]},
        {"text": "Pineapple pizza slaps. Fights welcome in the MARB after class. 👊🍍", "sentiment": [0.66]},
        {"text": "Honestly, pineapple adds a vibe. Don't @ me.", "sentiment": [0.65]},
        {"text": "Was skeptical at first, but now I kinda crave it sometimes.", "sentiment": [0.69]},
        {"text": "Unexpectedly good combo. The tang hits just right. 🍍🔥", "sentiment": [0.66]}
    ],
    (0.7, 0.8): [
        {"text": "Hawaiian pizza got me through finals.", "sentiment": [0.75]},
        {"text": "Pineapple pizza supremacy. You all just don't have the palate.", "sentiment": [0.78]},
        {"text": "Sweet, salty, cheesy, doughy — it's a flavor symphony. 🎶", "sentiment": [0.73]},
        {"text": "Pineapple on pizza is criminally underrated. I will die on this hill.", "sentiment": [0.76]}
    ],
    (0.8, 0.9): [
        {"text": "Pineapple on pizza is proof God wants us to be happy. 🍕✨", "sentiment": [0.85]},
        {"text": "The perfect bite: melty cheese, ham, and pineapple. Don't talk to me unless you've tried it.", "sentiment": [0.85]},
        {"text": "Pineapple on pizza is elite. Elite. Y'all are just scared of flavor.", "sentiment": [0.87]},
        {"text": "Haters gonna hate, but pineapple pizza is top tier. 🍍💅", "sentiment": [0.82]}
    ],
    (0.9, 1.0): [
        {"text": "Hawaiian pizza is celestial-tier cuisine.", "sentiment": [0.91]},
        {"text": "If you bring pineapple pizza to a ward activity, I'm marrying you.", "sentiment": [0.99]},
        {"text": "Can't trust anyone who doesn't like pineapple pizza. That's my love language.", "sentiment": [0.91]},
        {"text": "No cap, pineapple pizza changed my life. I'm emotional just thinking about it.", "sentiment": [0.99]}
    ]
}

def get_post_for_opinion(opinion: float) -> Dict[str, any]:
    POST_SELECTION_CONCENTRATION = 50.0
    
    clamped_opinion = np.clip(opinion, 0.001, 0.999)

    alpha = clamped_opinion * POST_SELECTION_CONCENTRATION
    beta = (1 - clamped_opinion) * POST_SELECTION_CONCENTRATION

    sampled_opinion = np.random.beta(a=alpha, b=beta)

    for (min_val, max_val), posts in OPINION_POSTS.items():
        if min_val <= sampled_opinion < max_val:
            return random.choice(posts)
        
    # Fallback for the case where sampled_opinion is exactly 1.0
    if sampled_opinion == 1.0:
        return random.choice(OPINION_POSTS[(0.9, 1.0)])
        
    return random.choice(list(OPINION_POSTS.values())[0]) 