# chatgpt_interface.py
import ast
import random
from openai import OpenAI
from typing import List, Dict
import numpy as np

class Poster:
    def __init__(self, api_key, opinion_axes, max_history=8):
        self.client = OpenAI(api_key=api_key)
        self.opinion_axes = opinion_axes
        self.chat_history = []
        self.max_history = max_history

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
        system_prompt = "You analyze social media posts and output opinion vectors. "
        system_prompt += "For each topic, rate the opinion on a scale of 0.0 to 1.0 where:\n"
        for i, axis in enumerate(self.opinion_axes):
            system_prompt += f"\nTopic {i+1}: {axis['name']}\n"
            system_prompt += f"0.0 = Strongly agrees with: {axis['con']}\n"
            system_prompt += f"1.0 = Strongly agrees with: {axis['pro']}\n"
            system_prompt += "0.5 = Neutral or topic not addressed\n"
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

    def generate_post(self, name, opinion_vector, max_retries=5):
        topic_idx = random.choice(range(len(self.opinion_axes)))
        axis = self.opinion_axes[topic_idx]
        opinion_on_topic = opinion_vector[topic_idx]

        if len(opinion_vector) != len(self.opinion_axes):
            raise ValueError("Opinion vector length must match number of axes")
        if not all(0 <= x <= 1 for x in opinion_vector):
            raise ValueError("All opinion values must be between 0 and 1")
        
        base_prompt = "You are a Facebook user in a Facebook group with your friends."
        
        system_prompt = f"{base_prompt} Generate a SINGLE, NATURAL social media post (max 100 chars) that expresses your view on a topic.\n\n"
        system_prompt += "CRITICAL RULES:\n"
        system_prompt += "1. MUST be under 100 characters including spaces. Keep it short.\n"
        system_prompt += "2. Express your view in a single, natural statement - DO NOT number or separate points\n"
        system_prompt += "3. Use stronger language for values near 0 or 1, moderate for values near 0.5\n"
        system_prompt += "4. Sound like a real social media user\n"
        system_prompt += "5. If you don't have an extreme position, avoid stereotyping. Leverage the precision opinion value.\n"
        if self.chat_history:
            system_prompt += f"6. Make sure your response is integrated into the conversation, often using the names of other users. Do not respond yourself, {name}\n"
            system_prompt += "\nCurrent conversation:\n"
            for entry in self.chat_history[-self.max_history:]:
                system_prompt += f"\n{entry['author']}: {entry['post']}"
        
        system_prompt += "\n\nExpress views on this topic:\n"
        system_prompt += f"\nTopic: {axis['name']}\n"
        system_prompt += f"View: {opinion_on_topic:.2f} on spectrum:\n"
        system_prompt += f"{axis['con']} (0.0) ←→ {axis['pro']} (1.0)\n"

        for attempt in range(max_retries):
            try:
                completion = self.client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": "Respond to the conversation above based on your assigned persona and opinion."}
                    ]
                )
                post = completion.choices[0].message.content.strip()
                self.chat_history.append({"author": name, "post": post})
                if len(self.chat_history) > self.max_history:
                    self.chat_history.pop(0)
                return post
            except Exception as e:
                if attempt == max_retries - 1:
                    raise Exception(f"Failed to generate valid post after {max_retries} attempts: {str(e)}")
                continue
        raise Exception(f"Failed to generate valid post after {max_retries} attempts for {name}")

    def add_external_post_to_history(self, author_name, post_content):
        self.chat_history.append({"author": author_name, "post": post_content})
        if len(self.chat_history) > self.max_history:
            self.chat_history.pop(0) 