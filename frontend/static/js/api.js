export async function fetchInitialState() {
    try {
        const response = await fetch('/api/initial_state');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Failed to fetch initial state:", error);
        throw error;
    }
}

export async function sendMessage(messageText) {
    try {
        const response = await fetch('/api/send_message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: messageText }),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({detail: "Send failed"}));
            throw new Error(`Error sending: ${errorData.detail}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Network error sending message.", error);
        throw error;
    }
}

export async function resetSimulation() {
    try {
        const response = await fetch('/api/reset_simulation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({detail: "Reset failed"}));
            throw new Error(`Reset failed: ${response.status} ${errorData.detail}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Reset error: ${error.message}`);
        throw error;
    }
}

export async function checkSimulationStatus() {
    try {
        const response = await fetch('/api/simulation_status');
        if (response.ok) {
            return await response.json();
        }
        throw new Error('Failed to check status');
    } catch (error) {
        console.error("Failed to check simulation status:", error);
        throw error;
    }
}

export async function toggleSimulation(isRunning) {
    const action = isRunning ? 'stop' : 'start';
    try {
        const response = await fetch('/api/control_simulation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action }),
        });
        if (response.ok) {
            const result = await response.json();
            console.log("System:", result.message);
            return result;
        } else {
            const errorData = await response.json().catch(() => ({detail: "Toggle failed"}));
            throw new Error(`Error: ${errorData.detail}`);
        }
    } catch (error) {
        console.error("Network error controlling simulation.");
        throw error;
    }
}

export async function updateSimulationSpeed(speed) {
    try {
        const response = await fetch('/api/update_speed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loop_sleep_time: speed }),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({detail: "Update speed failed"}));
            throw new Error(`Error updating speed: ${errorData.detail}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Network error updating speed.", error);
        throw error;
    }
} 