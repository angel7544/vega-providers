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

/* ---------------- MANIFEST ---------------- */
app.get("/manifest.json", (req, res) => {
  const manifestPath = path.join(currentDir, "manifest.json");

  if (fs.existsSync(manifestPath)) {
    return res.sendFile(manifestPath);
  }

  res.status(404).json({ error: "Manifest not found." });
});

/* ---------------- STATUS ---------------- */
app.get("/status", (req, res) => {
  res.json({ status: "running", platform: "vercel" });
});

/* ---------------- HEALTH ---------------- */
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

/* ---------------- PROVIDERS ---------------- */
app.get("/providers", (req, res) => {
  if (!fs.existsSync(distDir)) return res.json([]);

  const providers = fs
    .readdirSync(distDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name);

  res.json(providers);
});

/* ---------------- CATALOG (NEW FIX) ---------------- */
app.get("/catalog", async (req, res) => {
  const { provider } = req.query;

  if (!provider) {
    return res.status(400).json({ error: "provider is required" });
  }

  try {
    const modulePath = path.join(distDir, provider, "catalog.js");

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

/* ---------------- FETCH CORE ---------------- */
app.post("/fetch", async (req, res) => {
  const { provider, functionName, params } = req.body;

  if (!provider || !functionName) {
    return res
      .status(400)
      .json({ error: "provider and functionName are required" });
  }

  try {
    const modulePath = path.join(distDir, provider);

    let moduleFile;

    switch (functionName) {
      case "getPosts":
      case "getSearchPosts":
        moduleFile = path.join(modulePath, "posts.js");
        break;

      case "getMeta":
        moduleFile = path.join(modulePath, "meta.js");
        break;

      case "getEpisodes":
        moduleFile = path.join(modulePath, "episodes.js");
        break;

      case "getStream":
        moduleFile = path.join(modulePath, "stream.js");
        break;

      default:
        return res
          .status(400)
          .json({ error: `Unknown function: ${functionName}` });
    }

    if (!fs.existsSync(moduleFile)) {
      return res
        .status(404)
        .json({ error: `Module not found: ${provider}/${functionName}` });
    }

    // Hot reload (important for serverless)
    delete require.cache[require.resolve(moduleFile)];
    const module = require(moduleFile);

    if (!module[functionName]) {
      return res.status(404).json({
        error: `Function '${functionName}' not found in ${provider}`,
      });
    }

    /* -------- BASE URL LOADER -------- */
    let getBaseUrlFn = () => "";
    const baseUrlPath = path.join(distDir, "getBaseUrl.js");

    if (fs.existsSync(baseUrlPath)) {
      delete require.cache[require.resolve(baseUrlPath)];
      getBaseUrlFn = require(baseUrlPath).getBaseUrl;
    }

    /* -------- PROVIDER CONTEXT -------- */
    const fullParams = {
      ...params,
      providerValue: provider,
      providerContext: {
        axios,
        cheerio,
        getBaseUrl: getBaseUrlFn,
        commonHeaders: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
        Aes: {},
      },
    };

    const result = await module[functionName](fullParams);

    res.json(result);

  } catch (error) {
    console.error(
      `[fetch error] ${provider}/${functionName}:`,
      error.message
    );

    res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
});

/* ---------------- VLC ---------------- */
app.post("/vlc", (req, res) => {
  res.status(501).json({
    error: "VLC launch is not supported in cloud deployment.",
  });
});

/* ---------------- EXPORT ---------------- */
module.exports = app;