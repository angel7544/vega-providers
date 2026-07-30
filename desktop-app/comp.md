# Desktop Applications Comparison Report

A comprehensive comparison between the two desktop applications:
1. **OrbixPlay (Lite)** located at `d:\SteamLibrary\vega-providers\desktop-app`
2. **Vega** located at `D:\SteamLibrary\Vega4UPDT\vega-desktop`

Both applications are built using **Tauri v2** and **React/Vite**, but they diverge significantly in design complexity, architectural choices, streaming capabilities, and network capabilities.

---

## 1. High-Level Summary

| Feature | OrbixPlay (Lite) | Vega |
| :--- | :--- | :--- |
| **Product Name** | `OrbixLite` | `Vega` |
| **Frontend Stack** | Hybrid React (Welcome Screen) + Vanilla HTML/JS (Main UI) | Pure React / TypeScript + Vite + Zustand + TanStack Query |
| **Video Player** | Webview-embedded Player (`artplayer.js` + `hls.js`) | Native **libmpv** window (`tauri-plugin-libmpv`) + Custom HUD UI |
| **Extensibility** | Fixed provider model bound to a target API server | Dynamic extension system with installable catalog/media providers |
| **Network Bypasses** | None | Local Axum Stream Proxy (referers/User-Agents/header injecting) + DNS-over-HTTPS (`hickory-resolver`) |
| **BitTorrent Support**| None | Integrated torrent engine (`librqbit`) with background streaming server |
| **Downloader** | Basic HTTP chunked downloading | Decrypting AES-128 HLS segment downloader + TS sanitization |

---

## 2. Frontend Architecture & State Management

### 📥 OrbixPlay (Lite)
- **Hybrid Core**:
  - The entry point runs a React welcome screen ([WelcomeScreen.tsx](file:///d:/SteamLibrary/vega-providers/desktop-app/src/WelcomeScreen.tsx)) which acts as a connectivity gating screen checking an API server (defaults to `http://localhost:3001`).
  - Once connected, it displays the main application layout defined inside a large index file ([index.html](file:///d:/SteamLibrary/vega-providers/desktop-app/index.html)) and switches control to a Vanilla JS module ([app.js](file:///d:/SteamLibrary/vega-providers/desktop-app/src/app.js)) that manually builds DOM nodes and triggers state transitions.
- **State Management**: Implemented using basic local storage wrappers ([db.js](file:///d:/SteamLibrary/vega-providers/desktop-app/src/db.js)).
- **Styling**: Large Vanilla CSS files ([style.css](file:///d:/SteamLibrary/vega-providers/desktop-app/style.css)).

### 🌌 Vega
- **Modern SPA Architecture**:
  - Fully React-based single-page application ([App.tsx](file:///D:/SteamLibrary/Vega4UPDT/vega-desktop/src/App.tsx)) leveraging TypeScript.
  - Organized modularly into page components (e.g., [CatalogPage.tsx](file:///D:/SteamLibrary/Vega4UPDT/vega-desktop/src/pages/CatalogPage.tsx), [ExtensionsPage.tsx](file:///D:/SteamLibrary/Vega4UPDT/vega-desktop/src/pages/ExtensionsPage.tsx), [PlayerPage.tsx](file:///D:/SteamLibrary/Vega4UPDT/vega-desktop/src/pages/PlayerPage.tsx)).
- **State & Data Fetching**:
  - Uses **Zustand** for complex interface states, user settings, and torrent queues.
  - Uses **TanStack Query (React Query)** to handle caching, background refetching, and state management of remote data.
- **Spatial Navigation**: Contains specialized support for D-Pad / controller navigation (`@noriginmedia/norigin-spatial-navigation-react`), making it suitable for Smart TVs or couch gaming setups.

---

## 3. Video Player & Playback Mechanisms

- **OrbixPlay (Lite)**:
  - Playback happens directly in the webview window using an HTML5 player wrapper ([artplayer.js](file:///d:/SteamLibrary/vega-providers/desktop-app/src/artplayer.js)) assisted by [hls.js](https://hls.js.video) to play HTTP Live Streaming (HLS) streams.
  - If VLC is installed locally, it can launch the external VLC process (`launch_vlc`) and pass along custom request headers.
- **Vega**:
  - Utilizes a native client plugin (`tauri-plugin-libmpv-api`) to spawn/link to a high-performance **libmpv** window.
  - This allows hardware-accelerated playback of high-bitrate files (such as 4K HDR BluRay content) that are normally unsupported or slow inside webview rendering engines.
  - It also includes custom, interactive playback overlays ([PlayerControls.tsx](file:///D:/SteamLibrary/Vega4UPDT/vega-desktop/src/pages/PlayerControls.tsx)) and subtitling/audio track toggling menus.

---

## 4. Advanced Network & Security features (Vega Only)

Vega implements complex networking bypasses directly inside its Rust core ([src-tauri/src](file:///D:/SteamLibrary/Vega4UPDT/vega-desktop/src-tauri/src)):

1. **Local Proxy Server (`stream_server.rs`)**:
   - Runs a local HTTP proxy server utilizing **Axum** on a dynamic port.
   - Rewrites `.m3u8` playlists and requests on the fly. When a stream segment is requested, the proxy injects headers (e.g., custom Referer and User-Agent) before fetching from the CDN, bypassing hotlink restrictions.
   - Automatically sanitizes MPEG-TS streams by searching for TS sync bytes (`0x47`) to strip junk headers prepended by anti-piracy servers.
2. **DNS-over-HTTPS (`doh_client.rs`)**:
   - Includes a secure HTTPS DNS resolver (`hickory-resolver`) to bypass local ISP DNS blocking and filters.
3. **Cookie Manager (`cookie_manager.rs`)**:
   - Handles cookie preservation and injection across custom streams.

---

## 5. Download Engine Comparison

Both apps provide download capabilities, but they are built differently:

- **OrbixPlay (Lite)**:
  - Performs direct HTTP streams downloading using standard `reqwest` blocks.
  - Standard progress notification triggers (`download-progress`) and supports basic Pause/Cancel states.
- **Vega (`download_manager.rs`)**:
  - Very advanced file-download manager.
  - **M3U8 HLS Parsing & Downloading**: Downloads whole multi-segmented HLS playlists locally by choosing the highest bandwidth stream, resolving relative urls, and saving it as a unified file.
  - **AES-128 Decryption**: Decrypts AES-128 encrypted HLS streams on the fly using Rust's `aes` and `cbc` block ciphers before merging segments.
  - **Init Map Support**: Handles fragmented MP4s (`EXT-X-MAP` init headers).
  - **Format Auto-Detection**: Sanitizes the output, determines whether the finished stream is fMP4 or MPEG-TS, and automatically outputs the correct extension (`.mp4` vs `.ts`).

---

## 6. Torrent Support (Vega Only)

Vega includes a native BitTorrent implementation:
- Integrates the Rust torrent engine **librqbit** ([torrent.rs](file:///D:/SteamLibrary/Vega4UPDT/vega-desktop/src-tauri/src/torrent.rs)).
- Creates a local torrent session, mounts a dualstack TCP socket interface on loopback, and exposes the `librqbit` REST API.
- This allows users to paste magnet links/torrents, steam them directly to `libmpv`, or manage background torrent files downloads directly inside the application.

---

## Conclusion & Recommendations

- **OrbixPlay (Lite)** is a lightweight, lower-overhead application designed as a simple client wrapper for a specific backend instance. It relies on standard browser video technologies (`hls.js` inside the webview) or forwards URLs to VLC.
- **Vega** is an advanced, standalone media entertainment center resembling applications like Stremio or Kodi. It integrates a native **MPV player**, contains a native **BitTorrent engine**, executes custom **AES-128 decryption** and HLS compilation on downloads, and implements bypasses for ISP/CDN stream blocks (DNS-over-HTTPS and Local headers proxy).
