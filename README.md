# Opinion Dynamics Network (Serverless Version)

This project simulates opinion dynamics on a social network, visualizing how opinions evolve and spread. The entire application now runs fully in the browser—no backend or server is required.

## Features
- Interactive network simulation of agent opinions
- Pregenerated social media posts mapped to opinion values
- Real-time opinion analysis using OpenAI's GPT models (API key required)
- All logic runs in the browser (JavaScript)

## Getting Started

### 1. Clone the Repository
```
git clone https://github.com/yourusername/opinion-dynamics-network.git
cd opinion-dynamics-network
```

### 2. Set Your OpenAI API Key
- Open `static/js/api.js`.
- Replace `YOUR_OPENAI_API_KEY_HERE` with your actual OpenAI API key:
  ```js
  export const OPENAI_API_KEY = 'sk-...';
  ```
- **Warning:** The API key will be visible to users in the browser. Use a key with limited permissions and monitor usage.

### 3. Run as a Static Site
You can open `index.html` directly in your browser, or serve the directory using any static file server:

#### Using Python (for local testing):
```
python3 -m http.server 8080
```
Then visit [http://localhost:8080](http://localhost:8080)

#### Or use [live-server](https://www.npmjs.com/package/live-server):
```
npm install -g live-server
live-server
```

## Project Structure
- `index.html` — Main HTML file
- `static/` — All CSS and JavaScript files
  - `js/` — All simulation, network, and UI logic
  - `style.css` — Styles
- **No backend or server required**

## Notes
- All simulation and analysis logic is now implemented in JavaScript.
- Pregenerated posts and network logic are fully client-side.
- OpenAI API calls are made directly from the browser.
- There is no persistent storage; all state is in-memory per browser session.

## Security Warning
- **Do not use a production OpenAI API key in this app.**
- All users will have access to the API key and can make requests on your quota.

## License
MIT