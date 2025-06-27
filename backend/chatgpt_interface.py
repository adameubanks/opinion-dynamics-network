# chatgpt_interface.py
import ast
import random
from openai import OpenAI
from typing import List, Dict
import numpy as np

class OpinionAnalyzer:
    def __init__(self, api_key, opinion_axes):
        self.client = OpenAI(api_key=api_key)
        self.opinion_axes = opinion_axes

    def _validate_opinion_vector(self, result):
        try:
            vector = eval(result)
            if not isinstance(vector, list):
                return None
            if not all(isinstance(x, (int, float)) for x in vector):
                return None
            if not all(0 <= x <= 1 for x in vector):
                return None
            while len(vector) < len(self.opinion_axes):
                vector.append(0.5)
            return vector[:len(self.opinion_axes)]
        except:
            return None

    def analyze_post(self, post, max_retries=5):
        system_prompt = "You analyze social media posts and output opinion vectors with high accuracy. "
        system_prompt += "Focus on the ACTUAL OPINION EXPRESSED, not just keywords. Consider context, tone, and intent.\n"
        system_prompt += "For each topic, rate the opinion on a scale of 0.0 to 1.0 where:\n"
        for i, axis in enumerate(self.opinion_axes):
            system_prompt += f"\nTopic {i+1}: {axis['name']}\n"
            system_prompt += f"0.0 = Strongly agrees with: {axis['con']}\n"
            system_prompt += f"1.0 = Strongly agrees with: {axis['pro']}\n"
            system_prompt += "0.5 = Neutral or topic not addressed\n"
        system_prompt += "\nEXAMPLES:\n"
        system_prompt += "'I love pineapple on pizza! It's a fantastic combination.' = [1.0] (strongest positive)\n"
        system_prompt += "'I'm a fan of pineapple on pizza, it's pretty good.' = [0.8] (clearly positive)\n"
        system_prompt += "'I guess pineapple on pizza is fine.' = [0.6] (mildly positive)\n"
        system_prompt += "'I don't really like pineapple on pizza.' = [0.4] (mildly negative)\n"
        system_prompt += "'I really don't like pineapple on pizza.' = [0.2] (clearly negative)\n"
        system_prompt += "'Absolutely not. Pineapple on pizza is a hard pass for me.' = [0.0] (strongest negative)\n"
        system_prompt += "\nOutput ONLY a Python list of floats, e.g. [0.8, 0.2]"
        
        for attempt in range(max_retries):
            try:
                completion = self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Analyze this post: {post}"}
                    ]
                )
                result = completion.choices[0].message.content.strip()
                vector = self._validate_opinion_vector(result)
                if vector is not None:
                    return vector
            except Exception as e:
                if attempt == max_retries - 1:
                    raise Exception(f"Failed after {max_retries} attempts: {str(e)}")
                continue
        raise Exception(f"Failed to get valid opinion vector after {max_retries} attempts for post: '{post[:50]}...'") 