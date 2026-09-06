const jwt = require("jsonwebtoken");
const logger = require("../helpers/logger");

const socketAuthMiddleware = (socket, next) => {
  const token =  socket.handshake.headers.token || socket.handshake.auth.token || socket.handshake.headers.authorization;
  if (!token) {
    return next(new Error('Authentication error: Token not provided.'));
  }
  const tokenValue = token;
  if (tokenValue) {
    jwt.verify(tokenValue, process.env.JWT_ACCESS_TOKEN, (err, decoded) => {
      if (err) {
        console.error(err);
        logger.error({
          message: err.message,
          status: err.status || 500,
          method: "socket-event",
          url: "socket-auth-middleware",
          stack: err.stack,
        });
        return next(new Error('Authentication error: Invalid token.'));
      }
      socket.decodedToken = decoded;
      next();
    });
  } else {
    return next(new Error('Authentication error: Token not provided.'));
  }
};

module.exports = socketAuthMiddleware;