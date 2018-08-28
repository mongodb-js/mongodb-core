'use strict';

const MongoCredentials = require('./mongoCredentials').MongoCredentials;
const MongoError = require('../error').MongoError;

/**
 * Creates a new Authentication mechanism
 * @class
 */
class AuthProvider {
  constructor(bson) {
    this.bson = bson;
    this.authStore = [];
  }
  /**
   * Authenticate
   * @method
   * @param {{Server}|{ReplSet}|{Mongos}} server Topology the authentication method is being called on
   * @param {Connection[]} connections Connections to authenticate using this authenticator
   * @param {string} db Name of the database
   * @param {string} username Username
   * @param {string} password Password
   * @param {authResultCallback} callback The callback to return the result from the authentication
   * @return {object}
   */
  auth(server, connections, source, username, password, mechanismProperties, callback) {
    if (typeof mechanismProperties === 'function') {
      callback = mechanismProperties;
      mechanismProperties = undefined;
    }
    const credentials = new MongoCredentials({ username, password, source, mechanismProperties });
    return this._auth(server, connections, credentials, callback);
  }

  /**
   * Impl of auth
   */
  _auth(server, connections, credentials, callback) {
    // Total connections
    let count = connections.length;

    if (count === 0) {
      return callback(null, null);
    }

    // Valid connections
    let numberOfValidConnections = 0;
    let errorObject = null;

    const execute = connection => {
      this._authenticateSingleConnection(server, connection, credentials, (err, r) => {
        // Adjust count
        count = count - 1;

        // If we have an error
        if (err) {
          errorObject = err;
        } else if (r.result && r.result['$err']) {
          errorObject = r.result;
        } else if (r.result && r.result['errmsg']) {
          errorObject = r.result;
        } else {
          numberOfValidConnections = numberOfValidConnections + 1;
        }

        // Still authenticating against other connections.
        if (count !== 0) {
          return;
        }

        // We have authenticated all connections
        if (numberOfValidConnections > 0) {
          // Store the auth details
          this.addCredentials(credentials);
          // Return correct authentication
          callback(null, true);
        } else {
          if (errorObject == null) {
            errorObject = new MongoError(`failed to authenticate using ${credentials.mechanism}`);
          }
          callback(errorObject, false);
        }
      });
    };

    const _execute = _connection => process.nextTick(() => execute(_connection));

    // For each connection we need to authenticate
    while (connections.length > 0) {
      _execute(connections.shift());
    }
  }

  /**
   * Adds credentials to store only if it does not exist
   * @param {MongoCredentials} credentials credentials to add to store
   */
  addCredentials(credentials) {
    let found = false;

    for (let i = 0; i < this.authStore.length; i++) {
      if (this.authStore[i].equal(credentials)) {
        found = true;
        break;
      }
    }

    if (!found) {
      this.authStore.push(credentials);
    }
  }

  /**
   * Re authenticate pool
   * @method
   * @param {{Server}|{ReplSet}|{Mongos}} server Topology the authentication method is being called on
   * @param {Connection[]} connections Connections to authenticate using this authenticator
   * @param {authResultCallback} callback The callback to return the result from the authentication
   * @return {object}
   */
  reauthenticate(server, connections, callback) {
    const authStore = this.authStore.slice(0);
    let count = authStore.length;
    if (count === 0) {
      return callback(null, null);
    }

    for (let i = 0; i < authStore.length; i++) {
      this._auth(server, connections, authStore[i], function(err) {
        count = count - 1;
        if (count === 0) {
          callback(err, null);
        }
      });
    }
  }

  /**
   * Remove authStore credentials
   * @method
   * @param {string} source Name of database we are removing authStore details about
   * @return {object}
   */
  logout(source) {
    this.authStore = this.authStore.filter(credentials => credentials.source !== source);
  }
}

/**
 * This is a result from a authentication strategy
 *
 * @callback authResultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {boolean} result The result of the authentication process
 */

module.exports = { AuthProvider };
