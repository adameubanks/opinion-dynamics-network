// GitHub Pages version - no API key needed
// Simple function that returns a predefined opinion vector

export async function analyzePostWithChatGPT(post, opinionAxes) {
    // For GitHub Pages, we'll use a simple mapping based on the post text
    // This is a simplified version that doesn't require API calls
    
    const postLower = post.toLowerCase();
    
    // Simple keyword-based sentiment analysis
    if (postLower.includes('love') || postLower.includes('amazing') || postLower.includes('perfect') || postLower.includes('best')) {
        return [0.9]; // Strongly for
    } else if (postLower.includes('like') || postLower.includes('good') || postLower.includes('delicious') || postLower.includes('fan')) {
        return [0.75]; // For
    } else if (postLower.includes('hate') || postLower.includes('disgusting') || postLower.includes('crime') || postLower.includes('illegal')) {
        return [0.1]; // Strongly against
    } else if (postLower.includes('don\'t like') || postLower.includes('wrong') || postLower.includes('weird') || postLower.includes('never')) {
        return [0.25]; // Against
    } else if (postLower.includes('not sure') || postLower.includes('maybe') || postLower.includes('fence') || postLower.includes('neutral')) {
        return [0.5]; // Neutral
    } else {
        // Default to neutral if no clear sentiment detected
        return [0.5];
    }
} 