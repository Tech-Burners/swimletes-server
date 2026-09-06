const app = require("./app");
require("dotenv").config();
const mongoose = require("mongoose");
const logger = require("./helpers/logger");
const { seedAdmin } = require("./seeder/seed");
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


let server = null;
const port = process.env.BACKEND_PORT || 3001;
const serverIP = process.env.API_SERVER_IP || "localhost";
const appName = process.env.APPNAME || "weego";

async function myServer() {
  try {
    await mongoose.connect(process.env.MONGODB_CONNECTION);
    await seedAdmin();
    server = app.listen(port, () => {
      console.dir(
        `---> ${appName} server is running at: http://${serverIP}:${port}`
      );
    });

    //start socket server
    socketServer.listen(socketPort, () => {
      console.dir(
        `---> 🌐  ${appName} Socket server is listening on: http://${serverIP}:${socketPort}`
      );
    });

    // Set up Socket.io event handlers
    socketIO(io);
    global.io = io;

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