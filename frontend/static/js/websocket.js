export function connectWebSocket(onMessage) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/simulation_updates`);

    socket.onopen = () => console.log("WebSocket connection established.");

    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        onMessage(message);
    };

    socket.onclose = () => {
        console.log("WebSocket connection closed. Attempting to reconnect...");
        setTimeout(() => connectWebSocket(onMessage), 5000);
    };

    socket.onerror = (error) => console.error("WebSocket error:", error);

    return socket;
} 