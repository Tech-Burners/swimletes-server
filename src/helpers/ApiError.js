class ApiError extends Error {
  constructor(statusCode = 500, message = 'An unexpected error occurred', stack = '') {
    super(message);
    this.statusCode = statusCode || 500;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = ApiError;
