'use strict';

/**
 * A representation of the credentials used by MongoDB
 * @class
 */
class MongoCredentials {
  /**
   * Creates a new MongoCredentials object
   * @param {object} [options]
   * @param {string} [options.username] The username used for authentication
   * @param {string} [options.password] The password used for authentication
   * @param {string} [options.source] The database that the user should authenticate against
   * @param {string} [options.mechanism] The method used to authenticate
   * @param {object} [options.mechanismProperties] special properties used some types of auth mechanisms
   */
  constructor(options) {
    options = options || {};
    this.username = options.username;
    this.password = options.password;
    this.source = options.source;
    this.mechanism = options.mechanism;
    this.mechanismProperties = options.mechanismProperties;
  }

  /**
   * Determines if two MongoCredentials objects are equivalent
   * @param {MongoCredentials} other another MongoCredentials object
   * @returns {boolean} true if the two objects are equal.
   */
  equals(other) {
    return (
      this.mechanism === other.mechanism &&
      this.username === other.username &&
      this.password === other.password &&
      this.source === other.source
    );
  }
}

module.exports = { MongoCredentials };
