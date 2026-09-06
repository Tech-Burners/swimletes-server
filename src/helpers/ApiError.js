class ApiError extends Error {
  constructor(statusCode, message = req.t('unexpected-error'), stack = '') {
    super(message);
    this.statusCode = statusCode || 500; // Default to 500 if no status code is provided
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = ApiError;
