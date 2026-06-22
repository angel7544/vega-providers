# 🌌 Vega Providers & Orbix Suite

Welcome to the **Vega Providers & Orbix Suite** repository! This project houses both the provider extensions for media scraping and the robust Rust-based desktop applications that consume them.

---

## 🚀 The Orbix Suite

The Orbix Suite is a modern, lightweight ecosystem designed for seamless media consumption. It consists of two primary applications built with **Tauri (Rust + React/TypeScript)**.

### 1. 🖥️ OrbixLite (Desktop App)
A rich media application acting as a central hub for users.
*   **Integrated Download Manager**: Capable of pausing, resuming, and tracking multiple concurrent downloads using Tokio async streams.
*   **VLC Integration**: Seamlessly streams content directly to VLC media player using custom HTTP headers, bypassing standard browser limitations.
*   **Atomic Database**: Uses a custom JSON database with atomic file renames (`.json.tmp` -> `.json`) to prevent data corruption.

### 2. 🔄 OrbixPlay Updater
A standalone patching utility ensuring the suite is always running the latest provider scripts.
*   **Self-Healing**: Pulls updates directly from GitHub, manages safe backups, and handles rollbacks if an update fails.
*   **Process Management**: Safely identifies and terminates conflicting Orbix processes before applying updates.
*   **Stateless Execution**: Relies purely on the filesystem for a near-zero memory footprint during massive zip extractions.

> 📚 **Detailed Architecture**: For a deep dive into the system design, ER diagrams, and process flows, check out the [System Architecture](system_architecture.md) and [Project Overview](overview.md) documents.

---

## 🧩 Provider Extensions

How providers are structured and how to create a new one.

### 📂 Provider Folder Structure
Each provider lives in its own folder under `providers/`:
```text
providers/
  myProvider/
    catalog.ts
    meta.ts
    posts.ts
    stream.ts
    episodes.ts (optional)
```

### 📄 File Explanations

#### 1. `catalog.ts` 📋
<img src="https://github.com/user-attachments/assets/40e5da3d-326d-4f5c-b266-a4167da2a269" width="200"/>

*   **Purpose:** Defines the categories or filters available for your provider.
*   **How it's used:**
    *   The `title` property is shown as the heading on the home page.
    *   The `filter` property is passed to `getPosts`.
*   **Exports:** `catalog` and `genres` (optional).

#### 2. `meta.ts` ℹ️
*   **Purpose:** Fetches metadata for a specific item (movie, show, etc.).
*   **Exports:** `getMeta({ link, providerContext })` -> Returns an `Info` object.

#### 3. `posts.ts` 📝
*   **Purpose:** Fetches lists of items (posts) and handles search.
*   **Exports:** `getPosts` and optional `getSearchPosts`.

#### 4. `stream.ts` 📺
*   **Purpose:** Fetches streaming links or sources for a given item.
*   **Exports:** `getStream` -> Returns an array of `Stream` objects.

#### 5. `episodes.ts` 🎬 (Optional)
*   **Purpose:** Handles episode-specific logic for series if they require a separate request.
*   **Exports:** `getEpisodes` -> Returns an array of `EpisodeLink` objects.

> 💡 **Tip:** `providerContext` is passed to each function, providing shared utilities like `axios`, `cheerio`, and standard headers.

### 🔗 About `linkList` in `meta.ts`
The `linkList` property describes available seasons, episodes, or direct links.

<img src="https://github.com/user-attachments/assets/f5dc31fc-0701-4d97-8056-01a58ecdefc0" width="200"/>

*   Use `episodesLink` if an extra request is needed to fetch episodes.
*   Use `directLinks` if you already have all episode links up front.

---

## 🛠️ Commands & Testing

### 🧪 Test Your Provider Locally

#### 1. Command Line Interface (CLI)
*   **Full End-to-End Test:**
    ```sh
    npm run test -- provider_name
    ```
    *(e.g., `npm run test -- showbox` - Picks random posts and tests end-to-end).*
    
*   **Single Function Test:**
    ```sh
    npm run test:provider provider_name function_name
    ```
    *(e.g., `npm run test:provider showbox getPosts` - Tests a specific function).*

#### 2. In-App Mobile Testing
1.  **Start the Dev Server:**
    ```sh
    npm run auto
    ```
    *(Logs a Mobile test url like `http://<your-local-ip>:3001`)*
2.  **Configure Vega App:**
    Go to `src/lib/services/ExtensionManager.ts` and set:
    ```ts
    private testMode = true;
    private baseUrlTestMode = "http://<your-local-ip>:3001";
    ```
3.  **Ensure Network Match:** Both devices must be on the same local network.

### 🖥️ Desktop App Commands (Tauri)
To run the desktop applications in development mode:

*   **OrbixLite Desktop App:**
    ```sh
    cd desktop-app
    npm install
    npm run tauri dev
    ```
*   **OrbixPlay Updater:**
    ```sh
    cd orbixplay-updater
    npm install
    npm run tauri dev
    ```

---
*Built with ❤️ for a better media experience.*
