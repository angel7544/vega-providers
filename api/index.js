const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const distDir = path.join(__dirname, "..", "dist");
const currentDir = path.join(__dirname, "..");

app.use(cors());
app.use(express.json());

// Manifest
app.get("/manifest.json", (req, res) => {
  const manifestPath = path.join(currentDir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    res.sendFile(manifestPath);
  } else {
    res.status(404).json({ error: "Manifest not found." });
  }
});

// Status
app.get("/status", (req, res) => {
  res.json({ status: "running", platform: "vercel" });
});

// Health
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Providers list
app.get("/providers", (req, res) => {
  if (!fs.existsSync(distDir)) return res.json([]);
  const providers = fs
    .readdirSync(distDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);
  res.json(providers);
});

// Main fetch endpoint
app.post("/fetch", async (req, res) => {
  const { provider, functionName, params } = req.body;

  if (!provider || !functionName) {
    return res.status(400).json({ error: "provider and functionName are required" });
  }

  try {
    const modulePath = path.join(distDir, provider);
    let moduleFile;

    if (functionName === "getPosts" || functionName === "getSearchPosts") {
      moduleFile = path.join(modulePath, "posts.js");
    } else if (functionName === "getMeta") {
      moduleFile = path.join(modulePath, "meta.js");
    } else if (functionName === "getEpisodes") {
      moduleFile = path.join(modulePath, "episodes.js");
    } else if (functionName === "getStream") {
      moduleFile = path.join(modulePath, "stream.js");
    } else {
      return res.status(400).json({ error: `Unknown function: ${functionName}` });
    }

    if (!fs.existsSync(moduleFile)) {
      return res.status(404).json({ error: `Module not found: ${provider}/${functionName}` });
    }

    // Delete cache so hot-reloading works on serverless (warm containers)
    delete require.cache[require.resolve(moduleFile)];
    const module = require(moduleFile);

    if (!module[functionName]) {
      return res.status(404).json({ error: `Function '${functionName}' not found in ${provider}` });
    }

    let getBaseUrlFn = (p) => "";
    const baseUrlPath = path.join(distDir, "getBaseUrl.js");
    if (fs.existsSync(baseUrlPath)) {
      delete require.cache[require.resolve(baseUrlPath)];
      getBaseUrlFn = require(baseUrlPath).getBaseUrl;
    }

    const fullParams = {
      ...params,
      providerValue: provider,
      providerContext: {
        axios,
        cheerio,
        getBaseUrl: getBaseUrlFn,
        commonHeaders: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        Aes: {},
      },
    };

    const result = await module[functionName](fullParams);
    res.json(result);
  } catch (error) {
    console.error(`[fetch error] ${provider}/${functionName}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// VLC is only available locally — return a clear error on Vercel
app.post("/vlc", (req, res) => {
  res.status(501).json({ error: "VLC launch is not supported in the cloud deployment." });
});

// Export for Vercel
module.exports = app;
