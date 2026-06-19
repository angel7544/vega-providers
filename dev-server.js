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
    this.distDir = path.join(__dirname, "dist");
    this.currentDir = path.join(__dirname);

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
        execSync("node build.js", { stdio: "inherit" });
        res.json({ success: true, message: "Build completed" });
      } catch (error) {
        console.error("Build failed:", error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Fetch endpoint - executes provider functions
    this.app.post("/fetch", async (req, res) => {
      try {
        const { provider, functionName, params } = req.body;
        
        if (!provider || !functionName) {
          return res.status(400).json({ error: "Missing provider or functionName" });
        }

        // Determine which module contains the function
        let moduleName = "";
        if (["getPosts", "getSearchPosts"].includes(functionName)) {
            moduleName = "posts.js";
        } else if (functionName === "getMeta") {
            moduleName = "meta.js";
        } else if (functionName === "getStream") {
            moduleName = "stream.js";
        } else if (functionName === "getEpisodes") {
            moduleName = "episodes.js";
        } else if (functionName === "getCatalog") {
            moduleName = "catalog.js";
        } else {
            return res.status(400).json({ error: "Unknown function" });
        }

        const modulePath = path.join(this.distDir, provider, moduleName);
        if (!fs.existsSync(modulePath)) {
            return res.status(404).json({ error: `Provider module ${provider}/${moduleName} not found` });
        }

        const module = require(modulePath);
        if (typeof module[functionName] !== 'function') {
            return res.status(400).json({ error: `Function ${functionName} not found in provider` });
        }
        
        // Clean URLs of double slashes (e.g. domain.com//path -> domain.com/path)
        const axiosInstance = require('axios').create();
        axiosInstance.interceptors.request.use(config => {
            if (config.url) config.url = config.url.replace(/([^:]\/)\/+/g, "$1");
            return config;
        });

        // Pass common context to provider if needed
        const providerContext = { 
            axios: axiosInstance, 
            cheerio: require('cheerio'),
            getBaseUrl: require('./dist/getBaseUrl.js').getBaseUrl,
            Aes: {}
        };
        const finalParams = { ...params, providerContext, providerValue: provider };

        const result = await module[functionName](finalParams);
        res.json(result);

      } catch (error) {
        console.error(`Error in /fetch for ${req.body?.provider}:`, error);
        res.status(500).json({ error: error.message });
      }
    });

    // Parse endpoint - similar to fetch but uses pre-fetched HTML
    this.app.post("/parse", async (req, res) => {
      try {
        const { provider, functionName, params, html } = req.body;
        
        if (!provider || !functionName) {
          return res.status(400).json({ error: "Missing provider or functionName" });
        }

        let moduleName = "";
        if (["getPosts", "getSearchPosts"].includes(functionName)) {
            moduleName = "posts.js";
        } else if (functionName === "getMeta") {
            moduleName = "meta.js";
        } else if (functionName === "getStream") {
            moduleName = "stream.js";
        } else if (functionName === "getEpisodes") {
            moduleName = "episodes.js";
        } else if (functionName === "getCatalog") {
            moduleName = "catalog.js";
        } else {
            return res.status(400).json({ error: "Unknown function" });
        }

        const modulePath = path.join(this.distDir, provider, moduleName);
        if (!fs.existsSync(modulePath)) {
            return res.status(404).json({ error: `Provider module ${provider}/${moduleName} not found` });
        }

        const module = require(modulePath);
        if (typeof module[functionName] !== 'function') {
            return res.status(400).json({ error: `Function ${functionName} not found in provider` });
        }
        
        const axiosInstance = require('axios').create();
        axiosInstance.interceptors.request.use(config => {
            if (config.url) config.url = config.url.replace(/([^:]\/)\/+/g, "$1");
            return config;
        });

        const providerContext = { 
            axios: axiosInstance, 
            cheerio: require('cheerio'),
            getBaseUrl: require('./dist/getBaseUrl.js').getBaseUrl,
            Aes: {}
        };
        const finalParams = { ...params, providerContext, providerValue: provider, html };

        const result = await module[functionName](finalParams);
        res.json(result);

      } catch (error) {
        console.error(`Error in /parse for ${req.body?.provider}:`, error);
        res.status(500).json({ error: error.message });
      }
    });

    // Catalog endpoint
    this.app.get("/catalog", async (req, res) => {
      try {
        const provider = req.query.provider;
        if (!provider) return res.status(400).json({ error: "Missing provider" });

        const modulePath = path.join(this.distDir, provider, "catalog.js");
        if (!fs.existsSync(modulePath)) {
            // Provide a default catalog
            return res.json({
                catalog: [
                    { title: "Latest Movies", filter: "/movies" },
                    { title: "Latest Series", filter: "/series" }
                ],
                genres: []
            });
        }
        const module = require(modulePath);
        if (typeof module.getCatalog === 'function') {
            const axiosInstance = require('axios').create();
            axiosInstance.interceptors.request.use(config => {
                if (config.url) config.url = config.url.replace(/([^:]\/)\/+/g, "$1");
                return config;
            });
            const providerContext = { 
                axios: axiosInstance, 
                cheerio: require('cheerio'),
                getBaseUrl: require('./dist/getBaseUrl.js').getBaseUrl,
                Aes: {}
            };
            const result = await module.getCatalog({ providerContext });
            return res.json(result);
        }

        res.json({ catalog: [], genres: [] });
      } catch (error) {
        res.status(500).json({ error: error.message });
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

    // Root endpoint
    this.app.get("/", (req, res) => {
      res.json({
        message: "Vega Providers Dev Server is running",
        endpoints: {
          manifest: "/manifest.json",
          status: "/status",
          providers: "/providers",
          health: "/health"
        }
      });
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
    const manifestPath = path.join(this.currentDir, "manifest.json");
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

if (process.env.VERCEL) {
  module.exports = server.app;
} else {
  server.start();
}
