'use strict';

/**
 * Global error handler middleware.
 * Must be the LAST middleware registered in Express.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;

  // Log full error in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Error]', err);
  } else if (statusCode >= 500) {
    console.error('[Error]', err.message);
  }

  res.status(statusCode).json({
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected error occurred.',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = { errorHandler };
