'use strict';

const EventEmitter = require('events').EventEmitter;
const {
  PoolClosedError,
  WaitQueueFullError,
  WaitQueueTimeoutError,
  PoolReleaseForeignConnectionError
} = require('./errors');
const { counter } = require('./counter');
const { Connection } = require('./connection');
const { WaitQueue } = require('./wait_queue');
const {
  PoolCreatedEvent,
  PoolClosedEvent,
  ConnectionCreatedEvent,
  // ConnectionReadyEvent,
  ConnectionClosedEvent,
  ConnectionAcquisitionStartedEvent,
  ConnectionAcquisitionFailedEvent,
  ConnectionAcquiredEvent,
  ConnectionReleasedEvent,
  PoolClearedEvent
} = require('./events');

const VALID_OPTIONS = [
  'maxPoolSize',
  'minPoolSize',
  'maxIdleTimeMS',
  'waitQueueSize',
  'waitQueueTimeoutMS'
];

function getOptions(options) {
  return VALID_OPTIONS.reduce((obj, key) => {
    if (options.hasOwnProperty(key)) {
      obj[key] = options[key];
    }
    return obj;
  }, {});
}

class Pool extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = getOptions(options);

    const waitQueue = new WaitQueue({
      pool: this,
      connectionAcquisition: () => this._tryToGetConnection(),
      waitQueueSize: typeof options.waitQueueSize === 'number' ? options.waitQueueSize : 0,
      waitQueueTimeoutMS:
        typeof options.waitQueueTimeoutMS === 'number' ? options.waitQueueTimeoutMS : 0
    });

    this.s = {
      waitQueue,
      maxPoolSize: typeof options.maxPoolSize === 'number' ? options.maxPoolSize : 100,
      minPoolSize: typeof options.minPoolSize === 'number' ? options.minPoolSize : 0,
      maxIdleTimeMS: typeof options.maxIdleTimeMS === 'number' ? options.maxIdleTimeMS : 0,
      counter: counter(1),
      Connection: options.Connection || Connection,
      id: options.id || 0,
      pid: process.pid,
      generation: 0,
      isClosed: false,
      availableConnections: [],
      releasedConnections: new Set(),
      settingUpConnections: new Set(),
      address: options.address
    };

    process.nextTick(() => {
      this._emitMonitoringEvent(new PoolCreatedEvent(this));
      this._satisfyMinPoolSize();
    });
  }

  // Public API
  acquire(callback) {
    this._emitMonitoringEvent(new ConnectionAcquisitionStartedEvent(this));

    if (this.s.isClosed) {
      this._emitMonitoringEvent(new ConnectionAcquisitionFailedEvent(this, 'poolClosed'));
      return callback(new PoolClosedError(this));
    }

    this.s.waitQueue.enter((...args) => {
      this._acquisitionHandler(callback, ...args);
    });
  }

  release(connection, force, callback) {
    if (typeof force === 'function' && typeof callback !== 'function') {
      callback = force;
      force = false;
    }

    if (!this.s.releasedConnections.has(connection)) {
      return callback(new PoolReleaseForeignConnectionError(this, connection));
    }

    const closed = this.s.isClosed;
    const stale = this._connectionIsStale(connection);
    const willDestroy = !!(force || closed || stale);

    // Properly adjust state of connection
    this.s.releasedConnections.delete(connection);
    if (!willDestroy) {
      this._pushConnection(connection);
    }

    this._emitMonitoringEvent(new ConnectionReleasedEvent(this, connection));

    if (willDestroy) {
      const reason = force ? 'force' : closed ? 'poolClosed' : 'stale';
      this._destroyConnection(connection, reason);
    }

    callback(null);
  }

  clear(callback) {
    this.s.generation += 1;
    this._emitMonitoringEvent(new PoolClearedEvent(this));
    callback();
  }

  close(callback) {
    this.s.isClosed = true;
    this.s.waitQueue.destroy();
    while (this.s.availableConnections.length) {
      this._destroyConnection(this.s.availableConnections.shift(), 'poolClosed');
    }
    this._emitMonitoringEvent(new PoolClosedEvent(this));
    callback();
  }

  destroy() {
    this.s.counter.return();
  }

  // Accessors for ease
  get id() {
    return this.s.id;
  }

  get pid() {
    return this.s.pid;
  }

  get generation() {
    return this.s.generation;
  }

  get totalConnectionCount() {
    return this.availableConnectionCount + this.s.releasedConnections.size;
  }

  get availableConnectionCount() {
    return this.s.availableConnections.length;
  }

  get address() {
    return this.s.address;
  }

  get metadata() {
    return {
      id: this.id,
      totalConnectionCount: this.totalConnectionCount,
      availableConnectionCount: this.availableConnectionCount,
      generation: this.generation,
      address: this.address
    };
  }

  // Private Helpers
  _acquisitionHandler(callback, err, connection) {
    if (!err) {
      this.s.releasedConnections.add(connection);
      this._emitMonitoringEvent(new ConnectionAcquiredEvent(this, connection));
      return callback(null, connection);
    }

    if (err instanceof WaitQueueFullError) {
      this._emitMonitoringEvent(new ConnectionAcquisitionFailedEvent(this, 'queueFull'));
    } else if (err instanceof WaitQueueTimeoutError) {
      this._emitMonitoringEvent(new ConnectionAcquisitionFailedEvent(this, 'timeout'));
    }

    return callback(err, connection);
  }

  _satisfyMinPoolSize() {
    const minPoolSize = this.s.minPoolSize;
    while (this.totalConnectionCount < minPoolSize) {
      this._pushConnection(this._createConnection());
    }
  }

  _createConnection() {
    const connection = new Connection({
      id: this.s.counter.next().value,
      generation: this.s.generation,
      maxIdleTimeMS: this.s.maxIdleTimeMS,
      poolId: this.id,
      address: this.address
    });

    this._emitMonitoringEvent(new ConnectionCreatedEvent(this, connection));

    return connection;
  }

  _pushConnection(connection) {
    connection.makeAvailable();
    this.s.availableConnections.push(connection);
  }

  _destroyConnection(connection, reason) {
    connection.destroy();
    this._emitMonitoringEvent(new ConnectionClosedEvent(this, connection, reason));
  }

  _tryToGetConnection() {
    const maxPoolSize = this.s.maxPoolSize;
    if (this.availableConnectionCount) {
      while (this.availableConnectionCount) {
        const connection = this.s.availableConnections.shift();
        if (this._connectionIsStale(connection) || this._connectionIsIdle(connection)) {
          this._destroyConnection(connection, 'stale');
        } else {
          return connection;
        }
      }
    }

    if (maxPoolSize <= 0 || this.totalConnectionCount < maxPoolSize) {
      return this._createConnection();
    }
  }

  _connectionIsStale(connection) {
    return connection.generation !== this.generation;
  }

  _connectionIsIdle(connection) {
    const maxIdleTimeMS = this.s.maxIdleTimeMS;
    return !!(maxIdleTimeMS && Date.now() - connection.lastMadeAvailable > maxIdleTimeMS);
  }

  _emitMonitoringEvent(ev) {
    this.emit(ev.type, ev);
  }
}

exports.Pool = Pool;
