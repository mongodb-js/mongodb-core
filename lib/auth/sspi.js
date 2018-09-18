'use strict';

const Kerberos = require('../utils').Kerberos;
const MongoAuthProcess = require('../utils').MongoAuthProcess;
const Query = require('../connection/commands').Query;
const AuthProvider = require('./auth_provider').AuthProvider;
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
    if (Kerberos == null) {
      return callback(new Error('Kerberos library is not installed'));
    }

    super.auth(writeCommand, connections, credentials, callback);
  }
}

var SSIPAuthenticate = function(
  self,
  username,
  password,
  gssapiServiceName,
  server,
  connection,
  options,
  callback
) {
  // Build Authentication command to send to MongoDB
  var command = {
    saslStart: 1,
    mechanism: 'GSSAPI',
    payload: '',
    autoAuthorize: 1
  };

  // Create authenticator
  var mongo_auth_process = new MongoAuthProcess(
    connection.host,
    connection.port,
    gssapiServiceName,
    options
  );

  // Execute first sasl step
  server(
    connection,
    new Query(self.bson, '$external.$cmd', command, {
      numberToSkip: 0,
      numberToReturn: 1
    }),
    function(err, r) {
      if (err) return callback(err, false);
      var doc = r.result;

      mongo_auth_process.init(username, password, function(err) {
        if (err) return callback(err);

        mongo_auth_process.transition(doc.payload, function(err, payload) {
          if (err) return callback(err);

          // Perform the next step against mongod
          var command = {
            saslContinue: 1,
            conversationId: doc.conversationId,
            payload: payload
          };

          // Execute the command
          server(
            connection,
            new Query(self.bson, '$external.$cmd', command, {
              numberToSkip: 0,
              numberToReturn: 1
            }),
            function(err, r) {
              if (err) return callback(err, false);
              var doc = r.result;

              mongo_auth_process.transition(doc.payload, function(err, payload) {
                if (err) return callback(err);

                // Perform the next step against mongod
                var command = {
                  saslContinue: 1,
                  conversationId: doc.conversationId,
                  payload: payload
                };

                // Execute the command
                server(
                  connection,
                  new Query(self.bson, '$external.$cmd', command, {
                    numberToSkip: 0,
                    numberToReturn: 1
                  }),
                  function(err, r) {
                    if (err) return callback(err, false);
                    var doc = r.result;

                    mongo_auth_process.transition(doc.payload, function(err, payload) {
                      // Perform the next step against mongod
                      var command = {
                        saslContinue: 1,
                        conversationId: doc.conversationId,
                        payload: payload
                      };

                      // Execute the command
                      server(
                        connection,
                        new Query(self.bson, '$external.$cmd', command, {
                          numberToSkip: 0,
                          numberToReturn: 1
                        }),
                        function(err, r) {
                          if (err) return callback(err, false);
                          var doc = r.result;

                          if (doc.done) return callback(null, true);
                          callback(new Error('Authentication failed'), false);
                        }
                      );
                    });
                  }
                );
              });
            }
          );
        });
      });
    }
  );
};

module.exports = SSPI;
