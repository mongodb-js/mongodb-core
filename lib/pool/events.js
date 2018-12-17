'use strict';

class PoolMonitoringEvent {
  constructor() {
    this.time = new Date();
  }
}

class PoolCreatedEvent extends PoolMonitoringEvent {
  constructor(pool) {
    super();
    this.type = 'connectionPoolCreated';
    this.pool = pool.metadata;
    this.options = pool.options;
  }
}

class PoolClosedEvent extends PoolMonitoringEvent {
  constructor(pool) {
    super();
    this.type = 'connectionPoolClosed';
    this.pool = pool.metadata;
  }
}

class ConnectionCreatedEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super();
    this.type = 'connectionCreated';
    this.pool = pool.metadata;
    this.connection = connection.metadata;
  }
}

class ConnectionReadyEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super();
    this.type = 'connectionReady';
    this.pool = pool.metadata;
    this.connection = connection.metadata;
  }
}

class ConnectionClosedEvent extends PoolMonitoringEvent {
  constructor(pool, connection, reason) {
    super();
    this.type = 'connectionClosed';
    this.pool = pool.metadata;
    this.connection = connection.metadata;
    this.reason = reason || 'unknown';
  }
}

class ConnectionAcquisitionStartedEvent extends PoolMonitoringEvent {
  constructor(pool) {
    super();
    this.type = 'connectionAcquisitionStarted';
    this.pool = pool.metadata;
  }
}

class ConnectionAcquisitionFailedEvent extends PoolMonitoringEvent {
  constructor(pool, reason) {
    super();
    this.type = 'connectionAcquisitionFailed';
    this.pool = pool.metadata;
    this.reason = reason;
  }
}

class ConnectionAcquiredEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super();
    this.type = 'connectionAcquired';
    this.pool = pool.metadata;
    this.connection = connection.metadata;
  }
}
class ConnectionReleasedEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super();
    this.type = 'connectionReleased';
    this.pool = pool.metadata;
    this.connection = connection.metadata;
  }
}
class PoolClearedEvent extends PoolMonitoringEvent {
  constructor(pool) {
    super();
    this.type = 'connectionPoolCleared';
    this.pool = pool.metadata;
  }
}

module.exports = {
  PoolCreatedEvent,
  PoolClosedEvent,
  ConnectionCreatedEvent,
  ConnectionReadyEvent,
  ConnectionClosedEvent,
  ConnectionAcquisitionStartedEvent,
  ConnectionAcquisitionFailedEvent,
  ConnectionAcquiredEvent,
  ConnectionReleasedEvent,
  PoolClearedEvent
};
