'use strict';

class PoolMonitoringEvent {
  constructor(type, pool) {
    this.time = new Date();
    this.type = type;
    this.pool = pool.metadata;
  }
}

class PoolCreatedEvent extends PoolMonitoringEvent {
  constructor(pool) {
    super('connectionPoolCreated', pool);
    this.options = pool.options;
  }
}

class PoolClosedEvent extends PoolMonitoringEvent {
  constructor(pool) {
    super('connectionPoolClosed', pool);
  }
}

class ConnectionCreatedEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super('connectionCreated', pool);
    this.connection = connection.metadata;
  }
}

class ConnectionReadyEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super('connectionReady', pool);
    this.connection = connection.metadata;
  }
}

class ConnectionClosedEvent extends PoolMonitoringEvent {
  constructor(pool, connection, reason) {
    super('connectionClosed', pool);
    this.connection = connection.metadata;
    this.reason = reason || 'unknown';
  }
}

class ConnectionAcquisitionStartedEvent extends PoolMonitoringEvent {
  constructor(pool) {
    super('connectionAcquisitionStarted', pool);
  }
}

class ConnectionAcquisitionFailedEvent extends PoolMonitoringEvent {
  constructor(pool, reason) {
    super('connectionAcquisitionFailed', pool);
    this.reason = reason;
  }
}

class ConnectionAcquiredEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super('connectionAcquired', pool);
    this.connection = connection.metadata;
  }
}
class ConnectionReleasedEvent extends PoolMonitoringEvent {
  constructor(pool, connection) {
    super('connectionReleased', pool);
    this.connection = connection.metadata;
  }
}
class PoolClearedEvent extends PoolMonitoringEvent {
  constructor(pool) {
    super('connectionPoolCleared', pool);
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
