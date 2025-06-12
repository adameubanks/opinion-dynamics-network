from typing import List, Dict, Tuple
import random

# Opinion ranges and corresponding posts with their sentiment values
OPINION_POSTS: Dict[Tuple[float, float], List[Dict[str, any]]] = {
    (0.0, 0.2): [
        {
            "text": "I absolutely hate pineapple on pizza. It's a crime against pizza!",
            "sentiment": [0.1]
        },
        {
            "text": "Pineapple on pizza is the worst idea ever. Sweet fruit doesn't belong on pizza!",
            "sentiment": [0.15]
        },
        {
            "text": "I can't believe anyone would put pineapple on pizza. It's disgusting!",
            "sentiment": [0.05]
        }
    ],
    (0.2, 0.4): [
        {
            "text": "I really don't like pineapple on pizza. It's just not for me.",
            "sentiment": [0.25]
        },
        {
            "text": "Pineapple on pizza? No thanks, I'll pass.",
            "sentiment": [0.3]
        },
        {
            "text": "I prefer my pizza without pineapple, thank you very much.",
            "sentiment": [0.35]
        }
    ],
    (0.4, 0.6): [
        {
            "text": "I'm neutral about pineapple on pizza. To each their own!",
            "sentiment": [0.5]
        },
        {
            "text": "Pineapple on pizza? I can take it or leave it.",
            "sentiment": [0.45]
        },
        {
            "text": "I don't have strong feelings about pineapple on pizza either way.",
            "sentiment": [0.55]
        }
    ],
    (0.6, 0.8): [
        {
            "text": "I actually kind of like pineapple on pizza!",
            "sentiment": [0.65]
        },
        {
            "text": "Pineapple on pizza is pretty good, I must admit.",
            "sentiment": [0.7]
        },
        {
            "text": "I enjoy pineapple on pizza from time to time.",
            "sentiment": [0.75]
        }
    ],
    (0.8, 1.0): [
        {
            "text": "I love pineapple on pizza! It's the perfect combination of sweet and savory!",
            "sentiment": [0.9]
        },
        {
            "text": "Pineapple on pizza is absolutely delicious!",
            "sentiment": [0.85]
        },
        {
            "text": "Pineapple on pizza is my favorite topping! The sweetness is perfect!",
            "sentiment": [0.95]
        }
    ]
}

def get_post_for_opinion(opinion: float) -> Dict[str, any]:
    """Get a random pre-generated post and its sentiment for the given opinion value."""
    for (min_val, max_val), posts in OPINION_POSTS.items():
        if min_val <= opinion < max_val:
            return random.choice(posts)
    # Fallback for edge cases
    return random.choice(list(OPINION_POSTS.values())[0]) 