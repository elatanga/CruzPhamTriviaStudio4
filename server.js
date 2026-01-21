
const express = require("express");
const path = require("path");

const app = express();

const REQUIRED = [
  "REACT_APP_FIREBASE_API_KEY",
  "REACT_APP_FIREBASE_AUTH_DOMAIN",
  "REACT_APP_FIREBASE_PROJECT_ID",
  "REACT_APP_FIREBASE_STORAGE_BUCKET",
  "REACT_APP_FIREBASE_MESSAGING_SENDER_ID",
  "REACT_APP_FIREBASE_APP_ID",
];

app.get("/runtime-config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

  const missing = REQUIRED.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");
  if (missing.length > 0) {
    console.error("Runtime config missing keys:", missing);
    res.status(200).send(`
      console.error("Runtime config missing keys:", ${JSON.stringify(missing)});
      window.__RUNTIME_CONFIG__ = null;
    `);
    return;
  }

  const cfg = {
    REACT_APP_FIREBASE_API_KEY: process.env.REACT_APP_FIREBASE_API_KEY,
    REACT_APP_FIREBASE_AUTH_DOMAIN: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    REACT_APP_FIREBASE_PROJECT_ID: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    REACT_APP_FIREBASE_STORAGE_BUCKET: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    REACT_APP_FIREBASE_MESSAGING_SENDER_ID: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    REACT_APP_FIREBASE_APP_ID: process.env.REACT_APP_FIREBASE_APP_ID,
    API_KEY: process.env.API_KEY || "", // Preserving API_KEY for Gemini Service
    BUILD_ENV: process.env.BUILD_ENV || process.env.NODE_ENV || "production",
    BUILD_VERSION: process.env.BUILD_VERSION || "unknown",
  };

  // Basic escaping for quotes/newlines
  const safe = (v) => String(v).replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$").replace(/\n/g, "\\n").replace(/\r/g, "\\r");

  res.status(200).send(`
    window.__RUNTIME_CONFIG__ = {
      REACT_APP_FIREBASE_API_KEY: "${safe(cfg.REACT_APP_FIREBASE_API_KEY)}",
      REACT_APP_FIREBASE_AUTH_DOMAIN: "${safe(cfg.REACT_APP_FIREBASE_AUTH_DOMAIN)}",
      REACT_APP_FIREBASE_PROJECT_ID: "${safe(cfg.REACT_APP_FIREBASE_PROJECT_ID)}",
      REACT_APP_FIREBASE_STORAGE_BUCKET: "${safe(cfg.REACT_APP_FIREBASE_STORAGE_BUCKET)}",
      REACT_APP_FIREBASE_MESSAGING_SENDER_ID: "${safe(cfg.REACT_APP_FIREBASE_MESSAGING_SENDER_ID)}",
      REACT_APP_FIREBASE_APP_ID: "${safe(cfg.REACT_APP_FIREBASE_APP_ID)}",
      API_KEY: "${safe(cfg.API_KEY)}",
      BUILD_ENV: "${safe(cfg.BUILD_ENV)}",
      BUILD_VERSION: "${safe(cfg.BUILD_VERSION)}"
    };
  `);
});

// Serve React build
const buildPath = path.join(__dirname, "build");
app.use(express.static(buildPath, { maxAge: "1h", etag: true }));

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(buildPath, "index.html"));
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server listening on port", port));
