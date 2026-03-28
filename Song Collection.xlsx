# Vega Providers: System Architecture & Design Documentation

## 1. System Overview
Vega Providers (also known as Vega Hub) is a unified multimedia entertainment platform designed to aggregate content from various third-party streaming providers into a single, high-performance desktop environment. It leverages a hybrid technology stack (Python, Node.js, and Web Technologies) to provide a seamless search, discovery, and playback experience.

The system is built on a **modular provider-based architecture**, allowing for easy extension and maintenance of external content sources without modifying the core application logic.

---

## 2. High-Level Architecture
The system consists of three primary layers: the **Desktop Client**, the **Backend Provider Server**, and the **External Provider Network**.

```mermaid
graph TD
    subgraph "Desktop Client (Python)"
        GUI[CustomTkinter GUI]
        Player[Webview Video Player]
        FFmpeg[FFmpeg/FFprobe Utility]
        AudioServer[Local Audio Proxy Server]
    end

    subgraph "Backend Server (Node.js)"
        Express[Express API Server]
        Bundler[ESBuild Provider Bundler]
        Dist[Bundled JS Providers]
    end

    subgraph "External Providers"
        SiteA[Streaming Site A]
        SiteB[Streaming Site B]
        API[IMDb/Cinemeta APIs]
    end

    GUI <--> Express
    Express --> Dist
    Dist <--> SiteA
    Dist <--> SiteB
    GUI <--> API
    Player <--> AudioServer
    AudioServer -- Extracts Audio --> FFmpeg
    FFmpeg -- Probes/Streams --> SiteA
```

---

## 3. Core Components

### 3.1 Desktop Client (Python Layer)
Designed with `CustomTkinter`, this layer manages the user interface, session persistence, and local utility orchestration.
*   **Launcher ([VegaHubLauncher.py](file:///d:/SteamLibrary/vega-providers/VegaHubLauncher.py))**: Handles portable execution environment setup, extracts bundled assets (`_MEIPASS`), and manages the lifecycle of the Node.js backend.
*   **Main HUB ([peott.py](file:///d:/SteamLibrary/vega-providers/peott.py))**: The primary navigation controller. It manages asynchronous data fetching, IMDb metadata enrichment, and provider switching.
*   **Internal Player ([player_window.py](file:///d:/SteamLibrary/vega-providers/player_window.py))**: A lightweight `pywebview` container that embeds `ArtPlayer`. It includes a custom Python HTTP server to proxy multi-audio tracks from MKV files.

### 3.2 Backend Provider Server (Node.js Layer)
Acts as a stateless proxy between the Python GUI and the logic-heavy scraping modules.
*   **API Gateway ([dev-server.js](file:///d:/SteamLibrary/vega-providers/dev-server.js))**: An Express.js server providing endpoints for content fetching (`/fetch`), manifest retrieval ([/manifest.json](file:///d:/SteamLibrary/vega-providers/manifest.json)), and VLC orchestration.
*   **Dynamic Module Execution**: Uses Node's `require` system to dynamically load and execute bundled provider modules at runtime based on the requested [provider](file:///d:/SteamLibrary/vega-providers/peott.py#176-202) ID.

### 3.3 Provider Framework (TypeScript Layer)
Individual modules that implement a standardized interface for interacting with various streaming sites.
*   **Interface Definition ([types.ts](file:///d:/SteamLibrary/vega-providers/providers/types.ts))**: Defines the [ProviderType](file:///d:/SteamLibrary/vega-providers/providers/types.ts#70-131), ensuring all providers implement `GetHomePosts`, `GetMetaData`, `GetStream`, and `GetSearchPosts`.
*   **Scraping Intelligence**: Utilizes `cheerio` for HTML parsing and `axios` for network requests, often including custom bypass logic (headers, cookies) for specific sites.

### 3.4 Multimedia Engine (Hybrid Layer)
A sophisticated playback system designed for high compatibility.
1.  **Direct Stream**: Standard MP4/HLS playback via ArtPlayer.
2.  **Hybrid MKV Multi-Audio**: Python probes the URL via `ffprobe`, launches a local streaming server, and feeds individual audio tracks into ArtPlayer's `switchAudio` API.
3.  **External Fallback**: Supports launching VLC directly for unsupported codecs.

---

## 4. Operational Workflows

### 4.1 Content Discovery Workflow
```mermaid
sequenceDiagram
    participant User
    participant GUI as Python GUI
    participant API as Node.js Backend
    participant Prov as Provider Module
    participant Web as External Site

    User->>GUI: Enters Search Query
    GUI->>API: POST /fetch (searchQuery)
    API->>Prov: Dynamic Require(posts.js)
    Prov->>Web: Axios GET (Scrape)
    Web-->>Prov: HTML/JSON Data
    Prov-->>API: Standardized Post[]
    API-->>GUI: JSON Response
    GUI->>User: Displays Result Cards
```

### 4.2 Playback Initialization Workflow
```mermaid
sequenceDiagram
    participant User
    participant GUI as Python GUI
    participant FF as FFmpeg/FFprobe
    participant Win as Player Window
    participant Serv as Audio Proxy
    participant Art as ArtPlayer (JS)

    User->>GUI: Selects Quality (MKV)
    GUI->>FF: Probe URL for Audio Tracks
    FF-->>GUI: Returns Track List (Index, Label)
    GUI->>Win: Launch Window(URL, Tracks)
    Win->>Serv: Initialize Local HTTP Server
    Win->>Art: Load with Multi-Audio Config
    Art->>Serv: GET /audio?index=1
    Serv->>FF: FFmpeg Pipe (Extract Track)
    FF-->>Art: MP3 Chunked Stream
```

---

## 5. Technology Stack

| Category | Technologies |
| :--- | :--- |
| **Frontend** | Python (3.x), CustomTkinter, PIL, PyWebView |
| **Backend** | Node.js (CommonJS), Express, Axios, Cheerio |
| **Bundling** | ESBuild (TypeScript to JS) |
| **Multimedia** | ArtPlayer.js, Hls.js, FFmpeg, FFprobe |
| **Packaging** | PyInstaller (Windows Portable EXE) |
| **Metadata** | IMDb Suggestion API, Cinemeta API |

---

## 6. Deployment & Portability
The application is designed for **Zero-Dependency Portability** on Windows:
*   **Self-Contained Executive**: Compiled using [VegaHub.spec](file:///d:/SteamLibrary/vega-providers/VegaHub.spec), bundling the Python interpreter, Node.js binary, and [server.bundle.js](file:///d:/SteamLibrary/vega-providers/server.bundle.js) into a single file.
*   **Runtime Extraction**: On startup, the launcher extracts bundled assets ([manifest.json](file:///d:/SteamLibrary/vega-providers/manifest.json), `dist/`, `web/`) to the local directory to allow for runtime configuration.
*   **Local FFmpeg Management**: The GUI includes a built-in installer to fetch and configure `ffmpeg.exe` locally if not present in the system PATH.
