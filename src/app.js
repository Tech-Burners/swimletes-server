const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const routes = require("./routes");
const logger = require("./helpers/logger");
const bodyParser = require("body-parser");
const session = require("express-session");
require("dotenv").config();
const { getDevLoginPage } = require("./helpers/logViewerLogin");


// Import Error Handling Middleware
const { notFoundHandler, errorHandler, errorConverter } = require("./middlewares/errorHandler");
const { logViewer } = require("./helpers/logViewer");


// Initialize Express App
const app = express();


// Body Parsers
app.use(
  express.json({
    limit: "100mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
); // JSON
app.use(bodyParser.urlencoded({ extended: true, limit: "100mb" })); // form submissions

// const flutterwaveWebhook = require("./helpers/flutterWaveWebhook");
// app.post("/api/v1/webhook/flutterwave", flutterwaveWebhook);

// Security Headers
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));

// Session
const MemoryStore = session.MemoryStore;
const memoryStore = new MemoryStore();

app.use(session({
  secret: process.env.SESSION_SECRET || 'realestate',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  },
  store: memoryStore,
}));


// CORS
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
}));


// ========== Custom API Logging Middleware ==========
app.use((req, res, next) => {
  const start = Date.now();
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "Unknown";

  res.on("finish", () => {
    const responseTime = Date.now() - start;
    logger.info({
      message: "API Hit",
      ip,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      responseTime
    });
  });

  next();
});

// Static Files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use('/public', express.static(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.static("public"));

// Serve assetlinks.json
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.json([{
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.example.weego",
      "sha256_cert_fingerprints": [
        "E5:01:D5:F0:FD:A6:80:08:6C:1A:98:75:F3:9E:4F:30:98:05:7D:7C:D8:8B:1E:0E:DA:09:37:AE:32:1C:45:99"
      ]
    }
  }]);
});

// Routes
const webhookRoutes = require("./modules/Booking/webhook.route");
app.use(["/webhook", "/weebhook", "/helpers", "/stripe"], webhookRoutes);
app.use("/api/v1", routes);

// Instructor UI Pages (Figma 40012288:1871, 40012321:3120, 40012392:3369)
app.get("/instructor", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/instructor/index.html"));
});

// Admin UI Pages - Overview & Disputes (Figma 40012554:15436, 40012554:20231 & 40012554:20832)
app.get(["/admin", "/admin/overview", "/admin/dashboard", "/admin/disputes", "/admin/disputes/*"], (req, res) => {
  res.sendFile(path.join(__dirname, "../public/admin/index.html"));
});


// Health check + log viewer
app.get("/", (req, res) => {
  res.send(getDevLoginPage());
});

app.post("/", (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.MONITOR_USERNAME && password === process.env.MONITOR_PASSWORD) {
    return logViewer(req, res);
  }
});

// Error handling middleware (keep last)
app.use(notFoundHandler);
app.use(errorConverter);
app.use(errorHandler);

module.exports = app;
