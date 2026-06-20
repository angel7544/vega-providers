# OrbixPlay Vega Provider Server

OrbixPlay Vega Provider Server is a Tauri-based desktop application that acts as a control interface for your local Node.js media server.

## What to Share

When distributing this application to others, you need to share a compressed folder (e.g., `.zip`) containing both the executable and the required server files.

You must include:
1. **The compiled executable** (`OrbixPlay-Vega-Server.exe`)
2. **The Node.js server files:**
   - `package.json`
   - `dev-server.js`
   - The `providers/` directory (where provider scripts are placed)

## Required Directory Structure

The application expects a specific directory structure to run properly. Because the executable looks for the server files in its **parent directory**, you must place the `.exe` inside a subfolder (e.g., `bin/`).

Your final shared folder should look exactly like this:

```text
OrbixPlay-Release/
├── package.json
├── dev-server.js
├── web/
│   ├── index.html
│   ├── style.css
│   └── scripts.js
├── providers/
│   └── (put your provider scripts here)
└── bin/
    └── OrbixPlay-Vega-Server.exe  <-- (The Tauri App Executable)
```

### Running the App
1. Extract the folder.
2. Navigate into the `bin/` folder.
3. Run `OrbixPlay-Vega-Server.exe`.
4. In the app, click **Install Dependencies** to install node modules.
5. Click **Verify Content Files** to ensure everything is in the right place.
6. Click **Start Server** to begin streaming!
