
const express = require("express");
const path = require("path");

const app = express();

// Required keys for Firebase connection (Clean standard env vars)
// These must be set in Cloud Run configuration without REACT_APP_ prefix
const REQUIRED = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID",
];

// Runtime Configuration Endpoint
app.get("/runtime-config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Filter missing keys from the REQUIRED list
  const missing = REQUIRED.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");

  if (missing.length > 0) {
    console.error("CRITICAL: Runtime config missing environment variables:", missing);
    // Return a safe, valid JS object indicating failure, never HTML
    res.status(200).send(`
      console.error("CRITICAL: Runtime config missing keys: ${JSON.stringify(missing)}");
      window.__RUNTIME_CONFIG__ = null;
    `);
    return;
  }

  // Construct configuration object from process.env
  const cfg = {
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
    // Optional / Service specific keys
    API_KEY: process.env.API_KEY || "", 
    BUILD_ENV: process.env.BUILD_ENV || process.env.NODE_ENV || "production",
    BUILD_VERSION: process.env.BUILD_VERSION || "unknown",
  };

  // Safe string escaping to prevent injection in the generated JS
  const safe = (v) => String(v).replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$").replace(/\n/g, "\\n").replace(/\r/g, "\\r");

  const jsContent = `
    window.__RUNTIME_CONFIG__ = {
      FIREBASE_API_KEY: "${safe(cfg.FIREBASE_API_KEY)}",
      FIREBASE_AUTH_DOMAIN: "${safe(cfg.FIREBASE_AUTH_DOMAIN)}",
      FIREBASE_PROJECT_ID: "${safe(cfg.FIREBASE_PROJECT_ID)}",
      FIREBASE_STORAGE_BUCKET: "${safe(cfg.FIREBASE_STORAGE_BUCKET)}",
      FIREBASE_MESSAGING_SENDER_ID: "${safe(cfg.FIREBASE_MESSAGING_SENDER_ID)}",
      FIREBASE_APP_ID: "${safe(cfg.FIREBASE_APP_ID)}",
      API_KEY: "${safe(cfg.API_KEY)}",
      BUILD_ENV: "${safe(cfg.BUILD_ENV)}",
      BUILD_VERSION: "${safe(cfg.BUILD_VERSION)}"
    };
  `;

  res.status(200).send(jsContent);
});

// Serve Static Assets from Build Directory
const buildPath = path.join(__dirname, "build");
app.use(express.static(buildPath, { 
  maxAge: "1h", 
  etag: true,
  setHeaders: (res, path) => {
    // Security headers for static assets
    res.setHeader("X-Content-Type-Options", "nosniff");
  }
}));

// SPA Fallback: Serve index.html for unknown routes
// IMPORTANT: Ignore requests that look like static assets (JS/CSS/Images) to prevent returning HTML for missing files
app.get("*", (req, res) => {
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|json|svg)$/)) {
    res.status(404).send("Not Found");
    return;
  }
  res.sendFile(path.join(buildPath, "index.html"));
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server listening on port", port));
