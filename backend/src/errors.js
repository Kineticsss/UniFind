'use strict';

// Error types from the LA2 contracts (I-1, I-2). middleware/errorHandler.js maps them to HTTP responses.

class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    Object.assign(this, { status, code, fields });
  }
}

const ValidationError = (fields) => new AppError(400, 'VALIDATION_ERROR', 'Fix the highlighted fields, then post again.', fields);
const AuthError = (message = 'Sign in again to continue.') => new AppError(401, 'UNAUTHENTICATED', message);
const NotFoundError = () => new AppError(404, 'NOT_FOUND', 'Report not found.');
const StorageError = () => new AppError(503, 'STORAGE_UNAVAILABLE', 'The database is unavailable. Please try again in a moment.');

module.exports = { AppError, ValidationError, AuthError, NotFoundError, StorageError };
