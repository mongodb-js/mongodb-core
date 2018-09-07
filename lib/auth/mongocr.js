'use strict';

const crypto = require('crypto');
const Query = require('../connection/commands').Query;
const AuthProvider = require('./auth_provider').AuthProvider;

/**
 * Creates a new MongoCR authentication mechanism
 * @class
 * @extends AuthProvider
 */
class MongoCR extends AuthProvider {
  /**
   * Implementation of authentication for a single connection
   * @override
   */
  _authenticateSingleConnection(writeCommand, connection, credentials, callback) {
    const username = credentials.username;
    const password = credentials.password;
    const source = credentials.source;

    // Write the commmand on the connection
    const getNonceCommand = new Query(
      this.bson,
      `${source}.$cmd`,
      { getnonce: 1 },
      { numberToSkip: 0, numberToReturn: 1 }
    );

    writeCommand(connection, getNonceCommand, (err, r) => {
      let nonce = null;
      let key = null;

      // Adjust the number of connections left
      // Get nonce
      if (err == null) {
        nonce = r.result.nonce;
        // Use node md5 generator
        let md5 = crypto.createHash('md5');
        // Generate keys used for authentication
        md5.update(username + ':mongo:' + password, 'utf8');
        const hash_password = md5.digest('hex');
        // Final key
        md5 = crypto.createHash('md5');
        md5.update(nonce + username + hash_password, 'utf8');
        key = md5.digest('hex');
      }

      // Execute command
      // Write the commmand on the connection
      const authenticateCommand = new Query(
        this.bson,
        `${source}.$cmd`,
        { authenticate: 1, user: username, nonce, key },
        { numberToSkip: 0, numberToReturn: 1 }
      );

      writeCommand(connection, authenticateCommand, callback);
    });
  }
}

module.exports = MongoCR;
