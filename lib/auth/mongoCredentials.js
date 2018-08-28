'use strict';

class MongoCredentials {
  constructor(options) {
    options = options || {};
    this.username = options.username;
    this.password = options.password;
    this.source = options.source;
    this.mechanism = options.mechanism;
    this.mechanismProperties = options.mechanismProperties;
  }

  equal(other) {
    return (
      this.mechanism === other.mechanism &&
      this.username === other.username &&
      this.password === other.password &&
      this.source === other.source
    );
  }
}

module.exports = { MongoCredentials };
