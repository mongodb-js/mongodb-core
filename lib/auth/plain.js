'use strict';

const retrieveBSON = require('../connection/utils').retrieveBSON;
const Query = require('../connection/commands').Query;
const AuthProvider = require('./auth_provider').AuthProvider;

// TODO: can we get the Binary type from this.bson instead?
const BSON = retrieveBSON();
const Binary = BSON.Binary;

/**
 * Creates a new Plain authentication mechanism
 * @class
 * @extends AuthProvider
 */
class Plain extends AuthProvider {
  /**
   * Implementation of authentication for a single connection
   * @override
   */
  _authenticateSingleConnection(writeCommand, connection, credentials, callback) {
    const username = credentials.username;
    const password = credentials.password;

    // Create payload
    const payload = new Binary(`\x00${username}\x00${password}`);

    // Let's start the sasl process
    const command = {
      saslStart: 1,
      mechanism: 'PLAIN',
      payload: payload,
      autoAuthorize: 1
    };

    const cmdQuery = new Query(this.bson, '$external.$cmd', command, {
      numberToSkip: 0,
      numberToReturn: 1
    });

    return writeCommand(connection, cmdQuery, callback);
  }
}

/**
 * This is a result from a authentication strategy
 *
 * @callback authResultCallback
 * @param {error} error An error object. Set to null if no error present
 * @param {boolean} result The result of the authentication process
 */

module.exports = Plain;
