
const express = require("express");
const path = require("path");

// Global Error Handlers - Prevent container exit on non-critical errors
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
  // In production, we might want to exit, but on Cloud Run, keeping the container alive 
  // to serve a friendly error page or retry is often safer during startup.
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();

// 1. CONSTANTS & ENV
const PORT = process.env.PORT || 8080;
const REQUIRED_KEYS = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID",
];

// 2. RUNTIME CONFIG ENDPOINT (Must be defined BEFORE static files)
app.get("/runtime-config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const missing = REQUIRED_KEYS.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");
  
  if (missing.length > 0) {
    console.error("CONFIG WARNING: Missing runtime keys:", missing);
    // Don't crash, but warn client
  }

  const safe = (v) => String(v || "").replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");

  const configContent = `
    window.__RUNTIME_CONFIG__ = {
      FIREBASE_API_KEY: "${safe(process.env.FIREBASE_API_KEY)}",
      FIREBASE_AUTH_DOMAIN: "${safe(process.env.FIREBASE_AUTH_DOMAIN)}",
      FIREBASE_PROJECT_ID: "${safe(process.env.FIREBASE_PROJECT_ID)}",
      FIREBASE_STORAGE_BUCKET: "${safe(process.env.FIREBASE_STORAGE_BUCKET)}",
      FIREBASE_MESSAGING_SENDER_ID: "${safe(process.env.FIREBASE_MESSAGING_SENDER_ID)}",
      FIREBASE_APP_ID: "${safe(process.env.FIREBASE_APP_ID)}",
      API_KEY: "${safe(process.env.API_KEY)}",
      BUILD_ENV: "${safe(process.env.BUILD_ENV || "production")}",
      BUILD_VERSION: "${safe(process.env.BUILD_VERSION || "1.0.0")}"
    };
    console.log("CRUZPHAM: Runtime config loaded");
  `;

  res.status(200).send(configContent);
});

// 3. HEALTH CHECK (Critical for Cloud Run)
app.get("/_health", (req, res) => {
  res.status(200).send("OK");
});

// 4. STATIC FILES
const buildPath = path.join(__dirname, "build");
app.use(express.static(buildPath, { 
  maxAge: "1h", 
  etag: true,
  setHeaders: (res, path) => {
    // Never cache index.html, allow service worker logic or hard reload
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// 5. SPA FALLBACK
// Catch-all handler for React Routing
app.get("*", (req, res) => {
  // Security: Don't serve index.html for missing static assets (prevent MIME confusion)
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|json|svg|map)$/)) {
    res.status(404).send("Not Found");
    return;
  }
  res.sendFile(path.join(buildPath, "index.html"));
});

// 6. START SERVER
try {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`SERVER: Listening on port ${PORT}`);
    console.log(`SERVER: Serving build from ${buildPath}`);
    console.log(`SERVER: Environment ${process.env.NODE_ENV}`);
  });
  
  // Graceful Shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Process terminated');
    });
  });
} catch (e) {
  console.error('CRITICAL: Server failed to start', e);
  process.exit(1);
}
