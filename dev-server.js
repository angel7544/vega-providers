const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const os = require("os");

/**
 * Local development server for testing providers
 */
class DevServer {
  constructor() {
    this.app = express();
    this.port = 3001;
    this.distDir = path.join(process.cwd(), "dist");
    this.currentDir = process.cwd();

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Enable CORS for mobile app
    this.app.use(
      cors({
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    );

    // Serve static files from dist directory
    this.app.use("/dist", express.static(this.distDir));

    // Serve web frontend
    const webDir = path.join(process.cwd(), "web");
    if (!fs.existsSync(webDir)) {
      fs.mkdirSync(webDir, { recursive: true });
    }
    this.app.use("/", express.static(webDir));
    
    // Serve artplayer.js if needed
    this.app.get("/artplayer.js", (req, res) => {
      const artPath = path.join(process.cwd(), "artplayer.js");
      if (fs.existsSync(artPath)) {
        res.sendFile(artPath);
      } else {
        res.status(404).send("artplayer.js not found");
      }
    });

    // JSON parsing
    this.app.use(express.json());

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
    this.app.post("/fetch", async (req, res) => {
      const { provider, functionName, params } = req.body;
      console.log(`🔍 Executing provider function: ${provider} - ${functionName}`);

      try {
        const modulePath = path.join(this.distDir, provider);
        let module;

        if (functionName === "getPosts" || functionName === "getSearchPosts") {
          module = require(path.join(modulePath, "posts.js"));
        } else if (functionName === "getMeta") {
          module = require(path.join(modulePath, "meta.js"));
        } else if (functionName === "getEpisodes") {
          module = require(path.join(modulePath, "episodes.js"));
        } else if (functionName === "getStream") {
          module = require(path.join(modulePath, "stream.js"));
        } else {
          return res.status(400).json({ error: `Unknown function: ${functionName}` });
        }

        if (!module[functionName]) {
          return res.status(404).json({ error: `Function '${functionName}' not found in ${provider}` });
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
        res.json(result);
      } catch (error) {
        console.error("Fetch failed:", error);
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
