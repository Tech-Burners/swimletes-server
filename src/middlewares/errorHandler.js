const unlinkImage = require('../helpers/unlinkImage');
const logger = require('../helpers/logger');
const response = require('../helpers/response');
const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../helpers/ApiError');

function errorConverter(err, req, res, next) {
  let error = err;

  if (!(error instanceof ApiError)) {
    // Use default values if they are missing
    const statusCode = error.statusCode || (error instanceof mongoose.Error ? httpStatus.BAD_REQUEST : httpStatus.INTERNAL_SERVER_ERROR);
    const message = error.message || 'An unknown error occurred';

    // Convert the error to ApiError with default values
    error = new ApiError(statusCode, message, err.stack);
  }

  next(error);
}

function notFoundHandler(req, res, next) {
  const message = `Requested API not found: ${req.method} ${req.originalUrl}`;
  next(new ApiError(httpStatus.NOT_FOUND, message));
}

function errorHandler(err, req, res, next) {
  // Ensure statusCode and message have defaults in case of missing values
  const statusCode = err.statusCode && typeof err.statusCode === 'number' ? err.statusCode : httpStatus.INTERNAL_SERVER_ERROR;
  const responseMessage = err.message || 'An unexpected error occurred';

  // Log error details with full information, including HTTP method and URL
  logger.error({
    message: responseMessage,
    status: statusCode,
    method: req.method,
    url: req.originalUrl,
    stack: err.stack,
  });

  // Unlink image if a file was uploaded
  if (req.file) {
    unlinkImage(req.file.path);
  }

  // Send JSON response with error details, ensuring no undefined status code
  res.status(statusCode).json(response({
    status: 'Error',
    statusCode,
    type: err.name || 'Error',
    message: responseMessage,
    data: null,
  }));
}

module.exports = { notFoundHandler, errorHandler, errorConverter };
