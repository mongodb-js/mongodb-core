'use strict';

class Connection {
  constructor(options = {}) {
    this.generation = options.generation;
    this.id = options.id;
    this.maxIdleTimeMS = options.maxIdleTimeMS;
    this.poolId = options.poolId;
    this.address = options.address;
    this.lastUsed = Date.now();
  }

  get metadata() {
    return {
      id: this.id,
      generation: this.generation,
      poolId: this.poolId,
      address: this.adress
    };
  }

  write(callback) {
    this.lastUsed = Date.now();
    setTimeout(() => callback());
  }

  makeAvailable() {
    this.lastMadeAvialable = new Date();
  }

  connect(callback) {
    setTimeout(() => callback(null, this));
  }

  destroy() {}
}

module.exports.Connection = Connection;
