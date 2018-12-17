'use strict';

class PoolClosedError extends Error {
  constructor(pool) {
    super('Attempted to acquire a connection from closed connection pool');
    Error.captureStackTrace(this, this.constructor);
    this.id = pool.id;
    this.errorType = 'poolClosedError';
    this.address = pool.address;
  }
}

class WaitQueueFullError extends Error {
  constructor(pool) {
    super('Attempted to acquire a connection from connection pool while waitQueue was full');
    Error.captureStackTrace(this, this.constructor);
    this.id = pool.id;
    this.errorType = 'waitQueueFullError';
    this.address = pool.address;
  }
}

class WaitQueueTimeoutError extends Error {
  constructor(pool) {
    super('Timed out while acquiring a connection from connection pool');
    Error.captureStackTrace(this, this.constructor);
    this.id = pool.id;
    this.errorType = 'waitQueueTimeoutError';
    this.address = pool.address;
  }
}

class PoolReleaseForeignConnectionError extends Error {
  constructor(pool, connection) {
    super('Attempted to release a connection created by a different pool');
    Error.captureStackTrace(this, this.constructor);
    this.id = pool.id;
    this.errorType = 'poolReleaseForeignConnectionError';
    this.address = pool.address;
    this.foreignConnectionInfo = connection.metadata;
  }
}

module.exports = {
  PoolClosedError,
  WaitQueueFullError,
  WaitQueueTimeoutError,
  PoolReleaseForeignConnectionError
};
