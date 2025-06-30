# Opinion Dynamics: Pineapple Pizza Debate

An interactive D3.js and FastAPI visualization of opinion dynamics, exploring how consensus forms in a social network.


## Core Idea

This project simulates how a social network's opinion on a controversial topic (pineapple on pizza) evolves over time. Users can inject their own opinions into the network and watch how it influences the group, leading to consensus, polarization, or persistent disagreement.

## Tech Stack

-   **Backend:** FastAPI, Uvicorn
-   **Frontend:** D3.js, Vanilla JavaScript
-   **AI:** OpenAI API (`gpt-4o-mini`)
-   **Real-time:** WebSockets
-   **Containerization:** Docker

### 1. Configure Environment

The project requires an OpenAI API key to analyze user posts.

Create an `.env` file and add your OpenAI API key:

```
OPENAI_API_KEY='your-api-key-here'
```

### 2. Run the Application

With Docker running, execute the following command in the project root:

```bash
docker-compose up --build
```

This will build the Docker containers and start the application.

### 3. View the Visualization

Open your web browser and navigate to:

[http://localhost:8000](http://localhost:8000)

You can now interact with the opinion dynamics simulation.