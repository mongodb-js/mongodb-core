'use strict';

const { PoolClosedError, WaitQueueFullError, WaitQueueTimeoutError } = require('./errors');

class WaitQueueMember {
  constructor(callback) {
    this.callback = callback;
    this.finished = false;
    this.timeout = null;
  }

  _finish(err, ret) {
    if (!this.finished) {
      this.finished = true;
      process.nextTick(() => this.callback.call(null, err, ret));
    }

    if (this.timeout) {
      clearTimeout(this.timeout);
    }
  }

  success(connection) {
    this._finish(null, connection);
  }

  failure(err) {
    this._finish(err);
  }

  setTimeout(cb, ms) {
    this.timeout = setTimeout(cb, ms);
  }
}

class WaitQueue {
  constructor(options) {
    this._destroyed = false;

    this.timeoutMS = options.waitQueueTimeoutMS || null;
    this.maxSize = options.waitQueueSize || null;
    this.periodMS = options.waitQueuePeriodMS || 10;
    this.connectionAcquisition = options.connectionAcquisition;

    this._pool = options.pool;
    this._queue = [];
    this._interval = null;
  }

  // Returns true if managed to enter wait queue
  enter(callback) {
    if (this.maxSize > 0 && this.maxSize <= this._queue.length) {
      setTimeout(() => callback(new WaitQueueFullError(this._pool)));
      return false;
    }

    const item = new WaitQueueMember(callback);
    this._queue.push(item);
    if (this.timeoutMS > 0) {
      item.setTimeout(() => this._timeoutHandler(item), this.timeoutMS);
    }

    this._start();

    return true;
  }

  destroy() {
    this._destroyed = true;
    this._stop();
    this._clear();
    this.connectionAcquisition = undefined;
    this._queue = undefined;
  }

  _timeoutHandler(item) {
    if (!item.finished) {
      this._queue.splice(this._queue.indexOf(item), 1);
      item.failure(new WaitQueueTimeoutError(this._pool));
    }
  }

  _clear() {
    while (this._queue.length) {
      const item = this._queue.shift();
      item.failure(new PoolClosedError(this._pool));
    }
  }

  _start() {
    if (!this._interval) {
      this._interval = setInterval(() => this._run(), this.periodMS);
    }
  }

  _stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = undefined;
    }
  }

  _run() {
    // If we're closed, destroy entire wait queue
    if (this._destroyed) {
      this._clear();
    }

    if (!this._queue.length) {
      return this._stop();
    }

    const item = this._queue.shift();
    if (item.finished) {
      return;
    }

    const connection = this.connectionAcquisition();
    if (connection) {
      item.success(connection);
    } else {
      this._queue.unshift(item);
    }
  }
}

module.exports = { WaitQueue };
