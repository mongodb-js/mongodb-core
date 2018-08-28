'use strict';

const crypto = require('crypto');
const Buffer = require('safe-buffer').Buffer;
const retrieveBSON = require('../connection/utils').retrieveBSON;
const Query = require('../connection/commands').Query;
const MongoError = require('../error').MongoError;
const AuthProvider = require('./authProvider').AuthProvider;

const BSON = retrieveBSON();
const Binary = BSON.Binary;

let saslprep;

try {
  saslprep = require('saslprep');
} catch (e) {
  // don't do anything;
}

var parsePayload = function(payload) {
  var dict = {};
  var parts = payload.split(',');

  for (var i = 0; i < parts.length; i++) {
    var valueParts = parts[i].split('=');
    dict[valueParts[0]] = valueParts[1];
  }

  return dict;
};

var passwordDigest = function(username, password) {
  if (typeof username !== 'string') throw new MongoError('username must be a string');
  if (typeof password !== 'string') throw new MongoError('password must be a string');
  if (password.length === 0) throw new MongoError('password cannot be empty');
  // Use node md5 generator
  var md5 = crypto.createHash('md5');
  // Generate keys used for authentication
  md5.update(username + ':mongo:' + password, 'utf8');
  return md5.digest('hex');
};

// XOR two buffers
function xor(a, b) {
  if (!Buffer.isBuffer(a)) a = Buffer.from(a);
  if (!Buffer.isBuffer(b)) b = Buffer.from(b);
  const length = Math.max(a.length, b.length);
  const res = [];

  for (let i = 0; i < length; i += 1) {
    res.push(a[i] ^ b[i]);
  }

  return Buffer.from(res).toString('base64');
}

function H(method, text) {
  return crypto
    .createHash(method)
    .update(text)
    .digest();
}

function HMAC(method, key, text) {
  return crypto
    .createHmac(method, key)
    .update(text)
    .digest();
}

var _hiCache = {};
var _hiCacheCount = 0;
var _hiCachePurge = function() {
  _hiCache = {};
  _hiCacheCount = 0;
};

const hiLengthMap = {
  sha256: 32,
  sha1: 20
};

function HI(data, salt, iterations, cryptoMethod) {
  // omit the work if already generated
  const key = [data, salt.toString('base64'), iterations].join('_');
  if (_hiCache[key] !== undefined) {
    return _hiCache[key];
  }

  // generate the salt
  const saltedData = crypto.pbkdf2Sync(
    data,
    salt,
    iterations,
    hiLengthMap[cryptoMethod],
    cryptoMethod
  );

  // cache a copy to speed up the next lookup, but prevent unbounded cache growth
  if (_hiCacheCount >= 200) {
    _hiCachePurge();
  }

  _hiCache[key] = saltedData;
  _hiCacheCount += 1;
  return saltedData;
}

/**
 * Creates a new ScramSHA authentication mechanism
 * @class
 * @return {ScramSHA} A cursor instance
 */
class ScramSHA extends AuthProvider {
  constructor(bson, cryptoMethod) {
    super(bson);
    this.cryptoMethod = cryptoMethod || 'sha1';
  }

  _auth(server, connections, credentials, callback) {
    let username = credentials.username;
    const password = credentials.password;
    const db = credentials.source;

    // Total connections
    let count = connections.length;
    if (count === 0) {
      return callback(null, null);
    }

    // Valid connections
    let numberOfValidConnections = 0;
    let errorObject = null;

    const cryptoMethod = this.cryptoMethod;
    let mechanism = 'SCRAM-SHA-1';
    let processedPassword;

    if (cryptoMethod === 'sha256') {
      mechanism = 'SCRAM-SHA-256';

      let saslprepFn = (server.s && server.s.saslprep) || saslprep;

      if (saslprepFn) {
        processedPassword = saslprepFn(password);
      } else {
        console.warn('Warning: no saslprep library specified. Passwords will not be sanitized');
        processedPassword = password;
      }
    } else {
      processedPassword = passwordDigest(username, password);
    }

    // Execute MongoCR
    const execute = connection => {
      // Clean up the user
      username = username.replace('=', '=3D').replace(',', '=2C');

      // Create a random nonce
      const nonce = crypto.randomBytes(24).toString('base64');
      // var nonce = 'MsQUY9iw0T9fx2MUEz6LZPwGuhVvWAhc'

      // NOTE: This is done b/c Javascript uses UTF-16, but the server is hashing in UTF-8.
      // Since the username is not sasl-prep-d, we need to do this here.
      const firstBare = Buffer.concat([
        Buffer.from('n=', 'utf8'),
        Buffer.from(username, 'utf8'),
        Buffer.from(',r=', 'utf8'),
        Buffer.from(nonce, 'utf8')
      ]);

      // Build command structure
      var cmd = {
        saslStart: 1,
        mechanism: mechanism,
        payload: new Binary(Buffer.concat([Buffer.from('n,,', 'utf8'), firstBare])),
        autoAuthorize: 1
      };

      // Handle the error
      const handleError = (err, r) => {
        if (err) {
          numberOfValidConnections = numberOfValidConnections - 1;
          errorObject = err;
          return false;
        } else if (r.result['$err']) {
          errorObject = r.result;
          return false;
        } else if (r.result['errmsg']) {
          errorObject = r.result;
          return false;
        } else {
          numberOfValidConnections = numberOfValidConnections + 1;
        }

        return true;
      };

      // Finish up
      const finish = (_count, _numberOfValidConnections) => {
        if (_count === 0 && _numberOfValidConnections > 0) {
          // Store the auth details
          this.addCredentials(credentials);
          // Return correct authentication
          return callback(null, true);
        } else if (_count === 0) {
          if (errorObject == null)
            errorObject = new MongoError('failed to authenticate using scram');
          return callback(errorObject, false);
        }
      };

      const handleEnd = (_err, _r) => {
        // Handle any error
        handleError(_err, _r);
        // Adjust the number of connections
        count = count - 1;
        // Execute the finish
        finish(count, numberOfValidConnections);
      };

      // Write the commmand on the connection
      server(
        connection,
        new Query(this.bson, `${db}.$cmd`, cmd, {
          numberToSkip: 0,
          numberToReturn: 1
        }),
        (err, r) => {
          // Do we have an error, handle it
          if (handleError(err, r) === false) {
            count = count - 1;

            if (count === 0 && numberOfValidConnections > 0) {
              // Store the auth details
              this.addCredentials(credentials);
              // Return correct authentication
              return callback(null, true);
            } else if (count === 0) {
              if (errorObject == null)
                errorObject = new MongoError('failed to authenticate using scram');
              return callback(errorObject, false);
            }

            return;
          }

          // Get the dictionary
          var dict = parsePayload(r.result.payload.value());

          // Unpack dictionary
          var iterations = parseInt(dict.i, 10);
          var salt = dict.s;
          var rnonce = dict.r;

          // Set up start of proof
          var withoutProof = `c=biws,r=${rnonce}`;
          var saltedPassword = HI(
            processedPassword,
            Buffer.from(salt, 'base64'),
            iterations,
            cryptoMethod
          );

          if (iterations && iterations < 4096) {
            const error = new MongoError(
              `Server returned an invalid iteration count ${iterations}`
            );
            return callback(error, false);
          }

          // Create the client key
          const clientKey = HMAC(cryptoMethod, saltedPassword, 'Client Key');

          // Create the stored key
          const storedKey = H(cryptoMethod, clientKey);

          // Create the authentication message
          const authMessage = [
            firstBare,
            r.result.payload.value().toString('base64'),
            withoutProof
          ].join(',');

          // Create client signature
          const clientSignature = HMAC(cryptoMethod, storedKey, authMessage);

          // Create client proof
          const clientProof = `p=${xor(clientKey, clientSignature)}`;

          // Create client final
          const clientFinal = [withoutProof, clientProof].join(',');

          // Create continue message
          const cmd = {
            saslContinue: 1,
            conversationId: r.result.conversationId,
            payload: new Binary(Buffer.from(clientFinal))
          };

          //
          // Execute sasl continue
          // Write the commmand on the connection
          server(
            connection,
            new Query(this.bson, `${db}.$cmd`, cmd, {
              numberToSkip: 0,
              numberToReturn: 1
            }),
            (err, r) => {
              if (r && r.result.done === false) {
                var cmd = {
                  saslContinue: 1,
                  conversationId: r.result.conversationId,
                  payload: Buffer.alloc(0)
                };

                // Write the commmand on the connection
                server(
                  connection,
                  new Query(this.bson, `${db}.$cmd`, cmd, {
                    numberToSkip: 0,
                    numberToReturn: 1
                  }),
                  function(err, r) {
                    handleEnd(err, r);
                  }
                );
              } else {
                handleEnd(err, r);
              }
            }
          );
        }
      );
    };

    const _execute = _connection => process.nextTick(() => execute(_connection));

    // For each connection we need to authenticate
    while (connections.length > 0) {
      _execute(connections.shift());
    }
  }
}

class ScramSHA1 extends ScramSHA {
  constructor(bson) {
    super(bson, 'sha1');
  }
}

class ScramSHA256 extends ScramSHA {
  constructor(bson) {
    super(bson, 'sha256');
  }
}

module.exports = { ScramSHA1, ScramSHA256 };
