const app = require("./app");
require("dotenv").config();
const mongoose = require("mongoose");
const logger = require("./helpers/logger");
const { seedAdmin } = require("./seeder/seed");
const { initCronJobs } = require("./helpers/cronJobs");
// Socket.io setup
const { createServer } = require("http");
const {socketIO} = require("./socket/socketIO.js");
const socket = require("socket.io");


const socketServer = createServer();


const socketPort = process.env.SOCKET_PORT || 3021;
const io = socket(socketServer, {
  cors: {
    origin: "*",
  },
  reconnection: true,
  reconnectionAttempts: 2,
  reconnectionDelay: 1000,
});


global.io = io;

let server = null;
let secondaryServer = null;
const port = Number(process.env.BACKEND_PORT) || 8049;
const serverIP = process.env.API_SERVER_IP || "localhost";
const appName = process.env.APPNAME || "swimletes";

async function myServer() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    await seedAdmin();
    initCronJobs();
    server = app.listen(port, () => {
      console.dir(
        `---> ${appName} server is running at: http://${serverIP}:${port}`
      );
    });

    // Support dual-port listening (8047 & 8049) to support devtunnel port configurations
    const altPort = port === 8049 ? 8047 : (port === 8047 ? 8049 : null);
    if (altPort) {
      try {
        secondaryServer = app.listen(altPort, () => {
          console.dir(
            `---> 🌐 ${appName} secondary port listener running at: http://${serverIP}:${altPort}`
          );
        });
      } catch (altErr) {
        // Continue cleanly if alt port is occupied
      }
    }

    // Attach Socket.io to Express HTTP servers so clients connecting to port 8049 / 8047 / 3049 all succeed seamlessly
    try {
      if (server) io.attach(server);
      if (secondaryServer) io.attach(secondaryServer);
    } catch (attachErr) {
      console.warn("Socket.io attach to express server warning:", attachErr.message);
    }

    //start socket server
    socketServer.listen(socketPort, () => {
      console.dir(
        `---> 🌐  ${appName} Socket server is listening on: http://${serverIP}:${socketPort}`
      );
    });

    // Set up Socket.io event handlers
    socketIO(io);

  } catch (error) {
    console.error("💀 Server start error:", error);
    logger.error({
      message: error.message,
      status: error.status || 500,
      method: "server-start",
      url: "server-start",
      stack: error.stack,
    });
    process.exit(1);
  }
}

myServer();

async function graceful(err) {
  console.error("Received shutdown signal or error:", err);
  logger.error({
    message: err.message,
    status: err.status || 500,
    method: "graceful",
    url: "server.js -> graceful",
    stack: err.stack,
  });
  if (server) {
    server.close(() => {
      console.log("Server closed. Exiting process.");
      process.exit(0);
    });
  }
  if (socketServer) {
    socketServer.close(() => {
      console.log("Socket server closed. Exiting process.");
      process.exit(0);
    });
  }
  else {
    process.exit(0);
  }
}

process.on("SIGINT", graceful);
process.on("SIGTERM", graceful);
process.on("uncaughtException", graceful);