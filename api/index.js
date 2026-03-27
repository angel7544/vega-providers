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

// Helper for providers
const getBaseUrl = () => {
  try {
    return require("../dist/getBaseUrl.js").getBaseUrl;
  } catch (e) {
    return (p) => "";
  }
};

// Routes
app.get("/api/manifest.json", (req, res) => {
  const manifestPath = path.join(currentDir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    res.sendFile(manifestPath);
  } else {
    res.status(404).json({ error: "Manifest not found." });
  }
});

app.get("/api/status", (req, res) => {
  res.json({ status: "running", platform: "vercel" });
});

app.get("/api/providers", (req, res) => {
  if (!fs.existsSync(distDir)) return res.json([]);
  const providers = fs.readdirSync(distDir, { withFileTypes: true })
    .filter(item => item.isDirectory())
    .map(item => item.name);
  res.json(providers);
});

app.post("/api/fetch", async (req, res) => {
  const { provider, functionName, params } = req.body;
  
  try {
    const modulePath = path.join(distDir, provider);
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

    const fullParams = {
      ...params,
      providerValue: provider,
      providerContext: {
        axios,
        cheerio,
        getBaseUrl: getBaseUrl(),
        commonHeaders: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        Aes: {},
      }
    };

    const result = await module[functionName](fullParams);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// For Vercel, export the app
module.exports = app;
