const jwt = require("jsonwebtoken");
const logger = require("../helpers/logger");

const socketAuthMiddleware = (socket, next) => {
  let rawToken =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization ||
    socket.handshake.headers?.token ||
    socket.handshake.query?.token;

  if (!rawToken) {
    return next(new Error('Authentication error: Token not provided.'));
  }

  // Strip 'Bearer ' prefix if present
  const token = typeof rawToken === 'string' && rawToken.startsWith('Bearer ')
    ? rawToken.slice(7).trim()
    : rawToken;

  if (token) {
    jwt.verify(token, process.env.JWT_ACCESS_TOKEN, (err, decoded) => {
      if (err) {
        console.error("Socket authentication error:", err.message);
        logger.error({
          message: err.message,
          status: err.status || 500,
          method: "socket-event",
          url: "socket-auth-middleware",
          stack: err.stack,
        });
        return next(new Error('Authentication error: Invalid or expired token.'));
      }
      socket.decodedToken = decoded;
      next();
    });
  } else {
    return next(new Error('Authentication error: Token not provided.'));
  }
};

module.exports = socketAuthMiddleware;