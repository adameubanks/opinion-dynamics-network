// WARNING: Storing API keys in frontend code exposes them to users. Use at your own risk!
export const OPENAI_API_KEY = 'sk-your-openai-api-key-here'; // <-- Replace with your key

export async function analyzePostWithChatGPT(post, opinionAxes, maxRetries = 5) {
    const systemPrompt = (() => {
        let prompt = "You analyze social media posts and output opinion vectors with high accuracy. ";
        prompt += "Focus on the ACTUAL OPINION EXPRESSED, not just keywords. Consider context, tone, and intent.\n";
        prompt += "For each topic, rate the opinion on a scale of 0.0 to 1.0 where:\n";
        for (let i = 0; i < opinionAxes.length; i++) {
            prompt += `\nTopic ${i + 1}: ${opinionAxes[i].name}\n`;
            prompt += `0.0 = Strongly agrees with: ${opinionAxes[i].con}\n`;
            prompt += `1.0 = Strongly agrees with: ${opinionAxes[i].pro}\n`;
            prompt += "0.5 = Neutral or topic not addressed\n";
        }
        prompt += "\nEXAMPLES:\n";
        prompt += "'I love pineapple on pizza! It's a fantastic combination.' = [1.0] (strongest positive)\n";
        prompt += "'I'm a fan of pineapple on pizza, it's pretty good.' = [0.8] (clearly positive)\n";
        prompt += "'I guess pineapple on pizza is fine.' = [0.6] (mildly positive)\n";
        prompt += "'I don't really like pineapple on pizza.' = [0.4] (mildly negative)\n";
        prompt += "'I really don't like pineapple on pizza.' = [0.2] (clearly negative)\n";
        prompt += "'Absolutely not. Pineapple on pizza is a hard pass for me.' = [0.0] (strongest negative)\n";
        prompt += "\nOutput ONLY a JavaScript array of numbers, e.g. [0.8, 0.2]";
        return prompt;
    })();

    function validateOpinionVector(result) {
        try {
            let vector = eval(result);
            if (!Array.isArray(vector)) return null;
            if (!vector.every(x => typeof x === 'number')) return null;
            if (!vector.every(x => x >= 0 && x <= 1)) return null;
            while (vector.length < opinionAxes.length) vector.push(0.5);
            return vector.slice(0, opinionAxes.length);
        } catch {
            return null;
        }
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Analyze this post: ${post}` }
                    ]
                })
            });
            const data = await response.json();
            const result = data.choices[0].message.content.trim();
            const vector = validateOpinionVector(result);
            if (vector !== null) return vector;
        } catch (e) {
            if (attempt === maxRetries - 1) {
                throw new Error(`Failed after ${maxRetries} attempts: ${e}`);
            }
            continue;
        }
    }
    throw new Error(`Failed to get valid opinion vector after ${maxRetries} attempts for post: '${post.slice(0, 50)}...'`);
} 