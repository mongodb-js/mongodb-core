'use strict';

const Query = require('../connection/commands').Query;
const AuthProvider = require('./auth_provider').AuthProvider;
const retrieveKerberos = require('../utils').retrieveKerberos;
let kerberos;

/**
 * Creates a new SSPI authentication mechanism
 * @class
 * @extends AuthProvider
 */
class SSPI extends AuthProvider {
  /**
   * Implementation of authentication for a single connection
   * @override
   */
  _authenticateSingleConnection(writeCommand, connection, credentials, callback) {
    // TODO: Destructure this
    const username = credentials.username;
    const password = credentials.password;
    const mechanismProperties = credentials.mechanismProperties;
    const gssapiServiceName = mechanismProperties['gssapiServiceName'] || 'mongodb';

    SSIPAuthenticate(
      this,
      kerberos.processes.MongoAuthProcess,
      username,
      password,
      gssapiServiceName,
      writeCommand,
      connection,
      mechanismProperties,
      callback
    );
  }

  /**
   * Authenticate
   * @override
   * @method
   */
  auth(writeCommand, connections, credentials, callback) {
    if (kerberos == null) {
      try {
        kerberos = retrieveKerberos();
      } catch (e) {
        return callback(e, null);
      }
    }

    super.auth(writeCommand, connections, credentials, callback);
  }
}

function SSIPAuthenticate(
  self,
  MongoAuthProcess,
  username,
  password,
  gssapiServiceName,
  server,
  connection,
  options,
  callback
) {
  const authProcess = new MongoAuthProcess(
    connection.host,
    connection.port,
    gssapiServiceName,
    options
  );

  function authCommand(command, authCb) {
    const query = new Query(self.bson, '$external.$cmd', command, {
      numberToSkip: 0,
      numberToReturn: 1
    });

    server(connection, query, authCb);
  }

  authProcess.init(username, password, err => {
    if (err) return callback(err, false);

    authProcess.transition('', (err, payload) => {
      if (err) return callback(err, false);

      const command = {
        saslStart: 1,
        mechanism: 'GSSAPI',
        payload,
        autoAuthorize: 1
      };

      authCommand(command, (err, result) => {
        if (err) return callback(err, false);
        const doc = result.result;

        authProcess.transition(doc.payload, (err, payload) => {
          if (err) return callback(err, false);
          const command = {
            saslContinue: 1,
            conversationId: doc.conversationId,
            payload
          };

          authCommand(command, (err, result) => {
            if (err) return callback(err, false);
            const doc = result.result;

            authProcess.transition(doc.payload, (err, payload) => {
              if (err) return callback(err, false);
              const command = {
                saslContinue: 1,
                conversationId: doc.conversationId,
                payload
              };

              authCommand(command, (err, response) => {
                if (err) return callback(err, false);

                authProcess.transition(null, err => {
                  if (err) return callback(err, null);
                  callback(null, response);
                });
              });
            });
          });
        });
      });
    });
  });
}

module.exports = SSPI;
