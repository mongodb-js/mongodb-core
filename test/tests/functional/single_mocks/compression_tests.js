exports['server should recieve list of client\'s supported compressors in handshake'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server,
      ObjectId = configuration.require.BSON.ObjectId,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var server = null;
    var running = true;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Prepare the server's response
    var defaultServerResponse = {
      "ismaster" : true,
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "ok" : 1
    }
    var serverResponse = [extend(defaultServerResponse, {})];

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(37019, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();
          test.equal(request.response.documents[0].compression[0], 'snappy');
          test.equal(request.response.documents[0].compression[1], 'zlib');
          request.reply(serverResponse[0]);
        }
      });

    }).catch(function(err) {
      console.log(err)
    });

    // Attempt to connect
    var client = new Server({
      host: 'localhost',
      port: '37019',
      connectionTimeout: 5000,
      socketTimeout: 1000,
      size: 1,
      compression: { compressors: ['snappy', 'zlib'], zlibCompressionLevel: -1},
    });

    client.on('connect', function() {
      client.destroy();
      running = false
      setTimeout(function () {
        test.done();
      }, 1000);
    });

    setTimeout(function () {
        client.connect();
    }, 100);
  }
}

exports['should connect and insert document when server is responding with OP_COMPRESSED with no compression'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server,
      ObjectId = configuration.require.BSON.ObjectId,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var server = null;
    var running = true;
    var currentStep = 0;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Prepare the server's response
    var defaultServerResponse = {
      "ismaster" : true,
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "ok" : 1
    }
    var serverResponse = [extend(defaultServerResponse, {})];

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(37047, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();
          var doc = request.document;

          if (currentStep == 0) {
            test.equal(request.response.documents[0].compression[0], 'snappy');
            test.equal(request.response.documents[0].compression[1], 'zlib');

            // Acknowledge connection using OP_COMPRESSED with no compression
            request.reply(serverResponse[0], { compression: { compressor: "no_compression"}});
            currentStep++;
          } else if (doc.insert && currentStep == 1) {
            // Acknowledge insertion using OP_COMPRESSED with no compression
            request.reply({ok:1, n: doc.documents.length, lastOp: new Date()}, { compression: { compressor: "no_compression"}});
          }
        }
      });

    }).catch(function(err) {
      console.log(err)
    });

    // Attempt to connect
    var client = new Server({
      host: 'localhost',
      port: '37047',
      connectionTimeout: 5000,
      socketTimeout: 1000,
      size: 1,
      compression: { compressors: ['snappy', 'zlib']},
    });

    client.on('connect', function(_server) {
      _server.insert('test.test', [{created:new Date()}], function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.n);

        client.destroy();
        setTimeout(function () {
          running = false
          test.done();
        }, 1000);
      })
    });

    setTimeout(function () {
        client.connect();
    }, 100);
  }
}

exports['should connect and insert document when server is responding with OP_COMPRESSED with snappy compression'] = {
  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server,
      ObjectId = configuration.require.BSON.ObjectId,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var server = null;
    var running = true;
    var currentStep = 0;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Prepare the server's response
    var defaultServerResponse = {
      "ismaster" : true,
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "compression": ["snappy"],
      "ok" : 1
    }
    var serverResponse = [extend(defaultServerResponse, {})];

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(37021, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();
          var doc = request.document;

          if (currentStep == 0) {
            test.equal(request.response.documents[0].compression[0], 'snappy');
            test.equal(request.response.documents[0].compression[1], 'zlib');

            // Acknowledge connection using OP_COMPRESSED with snappy
            request.reply(serverResponse[0], { compression: { compressor: "snappy"}});
            currentStep++;
          } else if (doc.insert && currentStep == 1) {
            // Acknowledge insertion using OP_COMPRESSED with snappy
            request.reply({ok:1, n: doc.documents.length, lastOp: new Date()}, { compression: { compressor: "snappy"}});
          }
        }
      });

    }).catch(function(err) {
      console.log(err)
    });

    // Attempt to connect
    var client = new Server({
      host: 'localhost',
      port: '37021',
      connectionTimeout: 5000,
      socketTimeout: 1000,
      size: 1,
      compression: { compressors: ['snappy', 'zlib']},
    });

    client.on('connect', function(_server) {
      _server.insert('test.test', [{created:new Date()}], function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.n);

        client.destroy();
        setTimeout(function () {
          running = false
          test.done();
        }, 1000);
      })
    });

    setTimeout(function () {
        client.connect();
    }, 100);
  }
}

exports['should connect and insert document when server is responding with OP_COMPRESSED with zlib compression'] = {

  metadata: {
    requires: {
      generators: true,
      topology: "single"
    }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server,
      ObjectId = configuration.require.BSON.ObjectId,
      co = require('co'),
      mockupdb = require('../../../mock');

    // Contain mock server
    var server = null;
    var running = true;
    var currentStep = 0;

    // Extend the object
    var extend = function(template, fields) {
      for(var name in template) fields[name] = template[name];
      return fields;
    }

    // Prepare the server's response
    var defaultServerResponse = {
      "ismaster" : true,
      "maxBsonObjectSize" : 16777216,
      "maxMessageSizeBytes" : 48000000,
      "maxWriteBatchSize" : 1000,
      "localTime" : new Date(),
      "maxWireVersion" : 3,
      "minWireVersion" : 0,
      "compression": ["zlib"],
      "ok" : 1
    }
    var serverResponse = [extend(defaultServerResponse, {})];

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(37022, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();
          var doc = request.document;

          if (currentStep == 0) {
            test.equal(request.response.documents[0].compression[0], 'snappy');
            test.equal(request.response.documents[0].compression[1], 'zlib');

            // Acknowledge connection using OP_COMPRESSED with zlib
            request.reply(serverResponse[0], { compression: { compressor: "zlib"}});
            currentStep++;
          } else if (doc.insert && currentStep == 1) {
            // Acknowledge insertion using OP_COMPRESSED with zlib
            request.reply({ok:1, n: doc.documents.length, lastOp: new Date()}, { compression: { compressor: "zlib"}});
          }
        }
      });

    }).catch(function(err) {
      console.log(err)
    });

    // Attempt to connect
    var client = new Server({
      host: 'localhost',
      port: '37022',
      connectionTimeout: 5000,
      socketTimeout: 1000,
      size: 1,
      compression: { compressors: ['snappy', 'zlib']},
    });

    client.on('connect', function(_server) {
      _server.insert('test.test', [{created:new Date()}], function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.n);

        client.destroy();
        setTimeout(function () {
          running = false
          test.done();
        }, 1000);
      })
    });

    setTimeout(function () {
        client.connect();
    }, 100);
  }
}

/*
exports['Should correctly connect server to single instance and execute insert'] = {
  metadata: { requires: { topology: "single" } },

  test: function(configuration, test) {
    var Server = require('../../../../lib/topologies/server')
      , bson = require('bson');

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , bson: new bson()
    })

    // Add event listeners
    server.on('connect', function(server) {
      server.insert('integration_tests.inserts', {a:1}, function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.n);

        server.insert('integration_tests.inserts', {a:1}, {ordered:false}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          server.destroy();
          test.done();
        });
      });
    });

    // Start connection
    server.connect();
  }
}
*/
