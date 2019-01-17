'use strict';

const crypto = require('crypto');
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
    writeCommand(connection, `${source}.$cmd`, { getnonce: 1 }, (err, r) => {
      let nonce = null;
      let key = null;

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
      const authenticateCommand = {
        authenticate: 1,
        user: username,
        nonce,
        key
      };

      writeCommand(connection, `${source}.$cmd`, authenticateCommand, callback);
    });
  }
}

module.exports = MongoCR;
