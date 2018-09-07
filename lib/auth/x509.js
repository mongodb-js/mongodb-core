'use strict';

const Query = require('../connection/commands').Query;
const AuthProvider = require('./auth_provider').AuthProvider;

/**
 * Creates a new X509 authentication mechanism
 * @class
 * @extends AuthProvider
 */
class X509 extends AuthProvider {
  /**
   * Implementation of authentication for a single connection
   * @override
   */
  _authenticateSingleConnection(writeCommand, connection, credentials, callback) {
    const username = credentials.username;

    // Let's start the sasl process
    const command = { authenticate: 1, mechanism: 'MONGODB-X509' };

    // Add username if specified
    if (username) {
      command.user = username;
    }

    const query = new Query(this.bson, '$external.$cmd', command, {
      numberToSkip: 0,
      numberToReturn: 1
    });

    writeCommand(connection, query, callback);
  }
}

module.exports = X509;
