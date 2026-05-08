export function errorHandler(error, req, res, _next) {
  const statusCode = error.status || error.statusCode || 500;
  const isServerError = statusCode >= 500;
  const message = isServerError ? 'Internal server error' : error.message;

  res.err = error;

  if (req.log) {
    const logMethod = isServerError ? 'error' : 'warn';
    req.log[logMethod](
      {
        err: error,
        statusCode,
        requestId: req.id
      },
      'Request failed'
    );
  }

  res.status(statusCode).json({
    error: {
      message,
      statusCode,
      requestId: req.id
    }
  });
}
