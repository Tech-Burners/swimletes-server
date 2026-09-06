const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf, colorize } = format;

// Convert ISO timestamp → readable format
function formatTime(ts) {
  return new Date(ts).toLocaleString("en-US", {
    hour12: true,
  });
}

// Custom console log format
const consoleLogFormat = printf(({ level, message, timestamp, method, url, ip, responseTime }) => {
  return `${formatTime(timestamp)} || ${level} || ${ip ? `IP: ${ip}` : ''}  ||  ${method ? `${method}` : ''} ${url ? `${url}` : ''} ${message ? `| ${message}` : ''} ${responseTime ? `| ${responseTime}ms` : ''}`;
});

const logger = createLogger({
  level: "info",
  format: combine(
    timestamp(),
    colorize(),
    consoleLogFormat
  ),
  transports: [
    new transports.Console({
      level: "info",
    }),

    // Save only errors
    new transports.File({
      filename: "errors.log",
      level: "error",
      format: combine(timestamp(), format.json()),
    }),

    // Save all logs including response time
    new transports.File({
      filename: "combined.log",
      level: "info",
      format: combine(timestamp(), format.json()),
    }),
  ],
});

module.exports = logger;
