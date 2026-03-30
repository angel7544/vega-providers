const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const os = require("os");
const ffmpeg = require("fluent-ffmpeg");

/**
 * Local development server for testing providers
 */
class DevServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3001;
    this.distDir = path.join(process.cwd(), "dist");
    this.currentDir = process.cwd();

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Enable CORS for mobile app & Vercel frontend (CRITICAL)
    const cors = require("cors");
    this.app.use(cors({
      origin: "*",
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"]
    }));

    // JSON parsing
    this.app.use(express.json());

    // Serve static files from dist directory
    this.app.use("/dist", express.static(this.distDir));

    // Serve web frontend
    const webPath = path.join(this.currentDir, "web");
    if (fs.existsSync(webPath)) {
      console.log(`🌐 Serving web frontend from: ${webPath}`);
      this.app.use(express.static(webPath));
    }

    // Logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
      next();
    });
  }

  setupRoutes() {
    // Serve manifest.json
    this.app.get("/manifest.json", (req, res) => {
      const manifestPath = path.join(this.currentDir, "manifest.json");
      console.log(`Serving manifest from: ${manifestPath}`);

      if (fs.existsSync(manifestPath)) {
        res.sendFile(manifestPath);
      } else {
        res.status(404).json({ error: "Manifest not found. Run build first." });
      }
    });

    // Serve individual provider files
    this.app.get("/dist/:provider/:file", (req, res) => {
      const { provider, file } = req.params;
      const filePath = path.join(this.distDir, provider, file);

      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
      } else {
        res.status(404).json({
          error: `File not found: ${provider}/${file}`,
          hint: "Make sure to run build first",
        });
      }
    });

    // Build endpoint - trigger rebuild
    this.app.post("/build", (req, res) => {
      try {
        console.log("🔨 Triggering rebuild...");
        execSync("node build-bundled.js", { stdio: "inherit" });
        res.json({ success: true, message: "Build completed" });
      } catch (error) {
        console.error("Build failed:", error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Status endpoint
    this.app.get("/status", (req, res) => {
      const providers = this.getAvailableProviders();
      res.json({
        status: "running",
        port: this.port,
        providers: providers.length,
        providerList: providers,
        buildTime: this.getBuildTime(),
      });
    });

    // List available providers
    this.app.get("/providers", (req, res) => {
      const providers = this.getAvailableProviders();
      res.json(providers);
    });

    // Health check
    this.app.get("/health", (req, res) => {
      res.json({ status: "healthy", timestamp: new Date().toISOString() });
    });

    // Execution endpoint
    const getModule = (provider, functionName) => {
      const modulePath = path.join(this.distDir, provider);
      const moduleSubPath = {
        getPosts: "posts.js",
        getSearchPosts: "posts.js",
        getMeta: "meta.js",
        getEpisodes: "episodes.js",
        getStream: "stream.js"
      }[functionName];

      if (!moduleSubPath) return null;
      const fullModulePath = path.join(modulePath, moduleSubPath);
      if (!fs.existsSync(fullModulePath)) return null;
      return require(fullModulePath);
    };

    this.app.post("/fetch", async (req, res) => {
      const { provider, functionName, params } = req.body;
      console.log(`🔍 Executing provider function: ${provider} - ${functionName}`);

      try {
        const module = getModule(provider, functionName);
        if (!module || !module[functionName]) {
          return res.status(404).json({ error: `Provider or function not found` });
        }

        // Add providerContext if not present
        const fullParams = {
          ...params,
          providerValue: provider,
          providerContext: {
            axios: require("axios"),
            cheerio: require("cheerio"),
            getBaseUrl: require("./dist/getBaseUrl.js").getBaseUrl,
            commonHeaders: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            Aes: {},
          }
        };

        const result = await module[functionName](fullParams);

        // --- Centralized Proxy Wrapper ---
        if (functionName === "getStream" && Array.isArray(result)) {
           const processedResult = result.map(stream => {
             const link = stream.link || "";
             const needsProxy = [
               "hubcloud", "filepress", "pixel", "fastdl", "fsl", "cloudflarestorage", 
               "workers.dev", "googleusercontent", "drive.google"
             ].some(domain => link.toLowerCase().includes(domain));

             if (needsProxy) {
               const protocol = req.protocol;
               const host = req.get('host');
               const proxyBase = `${protocol}://${host}/stream`;
               const proxiedLink = `${proxyBase}?url=${encodeURIComponent(link)}&referer=${encodeURIComponent(link)}`;
               
               console.log(`🛡️ Proxying IP-locked source: ${stream.server}`);
               return { ...stream, link: proxiedLink, proxied: true };
             }
             return stream;
           });
           return res.json(processedResult);
        }

        res.json(result);
      } catch (error) {
        console.error("Fetch failed:", error.name, error.message, "Status:", error.response?.status);
        res.status(error.response?.status || 500).json({ 
            error: error.message,
            status: error.response?.status,
            isCloudflare: error.response?.data?.includes("Just a moment...") || error.response?.status === 403
        });
      }
    });

    // Parse endpoint for Hybrid Extraction
    this.app.post("/parse", async (req, res) => {
      const { provider, functionName, params, html } = req.body;
      console.log(`🧪 Hybrid Parsing for: ${provider} - ${functionName}`);

      try {
        const module = getModule(provider, functionName);
        if (!module || !module[functionName]) {
          return res.status(404).json({ error: `Provider or function not found` });
        }

        // --- MOCK AXIOS FOR INJECTION ---
        // We create a wrapper that returns the provided HTML for the first request
        const realAxios = require("axios");
        const mockAxios = async (url, config) => {
           console.log(`💉 Injecting HTML for URL: ${url}`);
           return { data: html, status: 200, headers: {}, config: config || {} };
        };
        // Add common axios properties to satisfy providers
        mockAxios.get = mockAxios;
        mockAxios.post = mockAxios;
        mockAxios.defaults = realAxios.defaults;
        mockAxios.interceptors = realAxios.interceptors;

        const fullParams = {
          ...params,
          providerValue: provider,
          providerContext: {
            axios: mockAxios,
            cheerio: require("cheerio"),
            getBaseUrl: require("./dist/getBaseUrl.js").getBaseUrl,
            commonHeaders: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            Aes: {},
          }
        };

        const result = await module[functionName](fullParams);
        res.json(result);
      } catch (error) {
        console.error("Parse failed:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // VLC Launch endpoint
    this.app.post("/vlc", (req, res) => {
      const { url } = req.body;
      console.log(`🧡 Launching VLC for: ${url}`);
      
      const vlcPaths = [
        "vlc",
        "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
        "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe"
      ];
      
      let started = false;
      const { spawn } = require("child_process");
      
      for (const p of vlcPaths) {
        try {
          spawn(p, [url], { detached: true, stdio: 'ignore' }).unref();
          started = true;
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (started) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: "Could not find VLC" });
      }
    });

    // Audio Info endpoint - detect tracks
    this.app.get("/audio-info", async (req, res) => {
      const { url, referer } = req.query;
      if (!url) return res.status(400).json({ error: "url is required" });

      console.log(`🎵 Probing audio tracks for: ${url}, referer: ${referer}`);
      
      const probeOptions = [];
      if (referer) {
         probeOptions.push("-headers", `Referer: ${referer}\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`);
      }
      
      ffmpeg.ffprobe(url, probeOptions, (err, metadata) => {
        if (err) {
          console.error("Probe failed:", err);
          return res.status(500).json({ error: "Could not probe stream" });
        }

        const audioTracks = metadata.streams
          .filter(s => s.codec_type === "audio")
          .map((s, index) => ({
            index: s.index,
            codec: s.codec_name,
            language: s.tags?.language || `Track ${index + 1}`,
            title: s.tags?.title || s.tags?.language || `Audio Track ${index + 1}`
          }));

        res.json({ audioTracks });
      });
    });

    // Streaming / Transcoding endpoint
    this.app.get("/stream", (req, res) => {
      const { url, audioIndex, transcode, referer, start } = req.query;
      if (!url) return res.status(400).json({ error: "url is required" });

      console.log(`🚀 Streaming with options: url=${url}, audioIndex=${audioIndex}, transcode=${transcode}, start=${start}`);

      // Set headers for video stream
      res.setHeader("Content-Type", "video/mp4");

      let command = ffmpeg();

      // Add seeking if provided (BEFORE input for fast seek)
      if (start && !isNaN(parseFloat(start))) {
        command.inputOptions([`-ss`, `${start}`]);
      }
      
      // Set input
      command.input(url);

      // Add input options for headers if provided
      if (referer) {
        command.inputOptions([`-headers`, `Referer: ${referer}\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`]);
      } else {
        // Default UA to avoid blocks
        command.inputOptions([`-headers`, `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n`]);
      }

      // Map video
      command.outputOptions("-map 0:v:0?");

      if (audioIndex !== undefined && audioIndex !== "") {
        command.outputOptions(`-map 0:${audioIndex}`);
      } else {
        command.outputOptions("-map 0:a:0?");
      }

      command.videoCodec("copy");

      if (transcode === "true") {
        command.audioCodec("aac").audioBitrate("192k");
        console.log("🛠 Transcoding audio to AAC...");
      } else {
        command.audioCodec("copy");
      }

      command
        .format("mp4")
        .outputOptions([
          "-movflags frag_keyframe+empty_moov+default_base_moof",
          "-tune zerolatency",
          "-timeout 30000000" // 30 seconds timeout for input
        ]);

      command.on("error", (err) => {
        if (!err.message.includes("SIGKILL") && !err.message.includes("Output stream closed")) {
          console.error("FFmpeg error:", err.message);
        }
        if (!res.headersSent) {
          res.status(500).send("Streaming failed");
        }
      });

      // --- CRITICAL CLEANUP FOR RENDER FREE TIER ---
      // When the user closes the player or disconnects, KILL the FFmpeg process
      // This ensures 0 storage usage and 0 lingering CPU/RAM usage.
      req.on("close", () => {
        console.log("⏹️ User disconnected. Killing stream process...");
        command.kill("SIGKILL");
      });

      command.pipe(res, { end: true });
    });

    // Catalog endpoint
    this.app.get("/catalog", (req, res) => {
      const { provider } = req.query;

      if (!provider) {
        return res.status(400).json({ error: "provider is required" });
      }

      try {
        const modulePath = path.join(this.distDir, provider, "catalog.js");

        if (!fs.existsSync(modulePath)) {
          return res.json({
            catalog: [{ title: "All", filter: "" }],
            genres: [],
          });
        }

        delete require.cache[require.resolve(modulePath)];
        const catalogModule = require(modulePath);

        const catalog = catalogModule.catalog?.length
          ? catalogModule.catalog
          : [{ title: "All", filter: "" }];

        const genres = catalogModule.genres || [];

        res.json({ catalog, genres });
      } catch (error) {
        console.error(`[catalog error] ${provider}:`, error.message);
        res.status(500).json({ error: error.message });
      }
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: "Not found",
        availableEndpoints: [
          "GET /manifest.json",
          "GET /dist/:provider/:file",
          "POST /build",
          "GET /status",
          "GET /providers",
          "GET /catalog",
          "GET /health",
          "GET /audio-info",
          "GET /stream",
        ],
      });
    });
  }

  getAvailableProviders() {
    if (!fs.existsSync(this.distDir)) {
      return [];
    }

    return fs
      .readdirSync(this.distDir, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name);
  }

  getBuildTime() {
    const manifestPath = path.join(this.rootDir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      const stats = fs.statSync(manifestPath);
      return stats.mtime.toISOString();
    }
    return null;
  }

  start() {
    // Get local IP address
    const interfaces = os.networkInterfaces();
    let localIp = "localhost";
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === "IPv4" && !iface.internal) {
          localIp = iface.address;
          break;
        }
      }
      if (localIp !== "localhost") break;
    }
    this.app.listen(this.port, "0.0.0.0", () => {
      console.log(`
🚀 Vega Providers Dev Server Started!

📡 Server URL: http://localhost:${this.port}
📱 Mobile Test URL: http://${localIp}:${this.port}

💡 Usage:
  1. Run 'npm run auto' to to start the dev server ☑️
  2. Update vega app to use: http://${localIp}:${this.port}
  3. Test your providers!

🔄 Auto-rebuild: POST to /build to rebuild after changes
      `);

      // Check if build exists
      if (!fs.existsSync(this.distDir)) {
        console.log('\n⚠️  No build found. Run "node build.js" first!\n');
      }
    });
  }
}

// Start the server
const server = new DevServer();
server.start();
