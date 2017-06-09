function executeCommand(configuration, db, cmd, options, cb) {
  var Pool = require('../../../lib/connection/pool')
    , f = require('util').format
    , MongoError = require('../../../lib/error')
    , bson = require('bson')
    , Query = require('../../../lib/connection/commands').Query;

  // Optional options
  if(typeof options == 'function') cb = options, options = {};
  // Set the default options object if none passed in
  options = options || {};

  // Alternative options
  var host = options.host || configuration.host;
  var port = options.port || configuration.port;

  // Attempt to connect
  var pool = new Pool({
    host: host, port: port, bson: new bson()
  });

  // Add event listeners
  pool.on('connect', function(_pool) {
    var query = new Query(new bson(), f('%s.$cmd', db), cmd, {numberToSkip: 0, numberToReturn: 1});
    _pool.write(query, {
      command:true
    }, function(err, result) {
      if(err) console.log(err.stack)
      // Close the pool
      _pool.destroy();
      // If we have an error return
      if(err) return cb(err);
      // Return the result
      cb(null, result.result);
    });
  });

  pool.connect.apply(pool, options.auth);
}

function locateAuthMethod(configuration, cb) {
  var Pool = require('../../../lib/connection/pool')
    , MongoError = require('../../../lib/error')
    , bson = require('bson')
    , f = require('util').format
    , Query = require('../../../lib/connection/commands').Query;

  // Set up operations
  var db = 'admin';
  var cmd = {ismaster:true}

  // Attempt to connect
  var pool = new Pool({
    host: configuration.host, port: configuration.port, bson: new bson()
  });

  // Add event listeners
  pool.on('connect', function(_pool) {
    var query = new Query(new bson(), f('%s.$cmd', db), cmd, {numberToSkip: 0, numberToReturn: 1});
    _pool.write(query, {
      command:true
    }, function(err, result) {
      if(err) console.log(err.stack)
      // Close the pool
      _pool.destroy();
      // If we have an error return
      if(err) return cb(err);

      // Establish the type of auth method
      if(!result.result.maxWireVersion || result.result.maxWireVersion == 2) {
        cb(null, 'mongocr');
      } else {
        cb(null, 'scram-sha-1');
      }
    });
  });

  pool.connect.apply(pool);
}

// Determine the version of mongod we can run
function getServerVersion(callback) {
  let co = require('co')
    , ServerManager = require('mongodb-topology-manager').Server;
  co(function*() {
    let server = new ServerManager('mongod');
    let serverDetails = yield server.discover()
    server.stop();
    callback(serverDetails.version)
  })
}

const MONGOD_COMPRESSION_SUPPORT_MIN_VERSION = 3.4

// Launch a mongod running with the specified options
function launchMongod(options, callback) {
  let co = require('co')
    , f = require('util').format
    , ServerManager = require('mongodb-topology-manager').Server
    , path = require('path');

    // Insert the dbpath into options
    options.dbpath = path.join(path.resolve('db'), f("data-%d", options.port));

  getServerVersion(function(version) {
    if (version[0] + version[1] * 0.1 < MONGOD_COMPRESSION_SUPPORT_MIN_VERSION) {
      delete options.networkMessageCompressors;
    }

    co(function*() {
      // Create new instance
      var server = new ServerManager('mongod', options);

      // Purge the directory
      yield server.purge();

      // Determine the server version
      var version = yield server.discover()

      // Start process
      yield server.start().catch(function(err) {
        if (err) {
          console.log(err)
        }
      });

      callback(server, version.version)

    }).catch(function(err) {
      console.log(err)
    })
  })
}

module.exports.launchMongod = launchMongod;
module.exports.executeCommand = executeCommand;
module.exports.locateAuthMethod = locateAuthMethod;
