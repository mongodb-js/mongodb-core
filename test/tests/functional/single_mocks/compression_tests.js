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
            test.equal(server.isCompressed, false);
            // Acknowledge connection using OP_COMPRESSED with no compression
            request.reply(serverResponse[0], { compression: { compressor: "no_compression"}});
            currentStep++;
          } else if (currentStep == 1) {
            test.equal(server.isCompressed, false);
            // Acknowledge insertion using OP_COMPRESSED with no compression
            request.reply({ok:1, n: doc.documents.length, lastOp: new Date()}, { compression: { compressor: "no_compression"}});
            currentStep++;
          } else if (currentStep == 2) {
            // Acknowledge update using OP_COMPRESSED with no compression
            test.equal(server.isCompressed, false);
            request.reply({ok:1, n: 1}, { compression: { compressor: "no_compression"}});
            currentStep++;
          } else if (currentStep == 3) {
            // Acknowledge removal using OP_COMPRESSED with no compression
            test.equal(server.isCompressed, false);
            request.reply({ok:1, n: 1}, { compression: { compressor: "no_compression"}});
          } else if (currentStep == 4) {
            test.equal(server.isCompressed, false);
            request.reply({ok:1}, { compression: {compressor: "no_compression"}})
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

    // Connect and try inserting, updating, and removing
    // All outbound messages from the driver will be uncompressed
    // Inbound messages from the server should be OP_COMPRESSED with no compression
    client.on('connect', function(_server) {
      _server.insert('test.test', [{a:1, created:new Date()}], function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.n);

        _server.update('test.test', {q: {a: 1}, u: {'$set': {b: 1}}}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          _server.remove('test.test', {q: {a: 1}}, function(err, r) {
            if (err) console.log(err)
            test.equal(null, err);
            test.equal(1, r.result.n);

            _server.command('system.$cmd', { ping: 1 }, function(err, result) {
              test.equal(null, err);
              test.equal(1, r.result.ok);

              client.destroy();
              setTimeout(function () {
                running = false
                test.done();
              }, 500);
            });    
          })
        })

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
      "compression": ['snappy'],
      "ok" : 1
    }
    var serverResponse = [extend(defaultServerResponse, {})];

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(37048, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();
          var doc = request.document;

          if (currentStep == 0) {
            test.equal(request.response.documents[0].compression[0], 'snappy');
            test.equal(request.response.documents[0].compression[1], 'zlib');
            test.equal(server.isCompressed, false);
            // Acknowledge connection using OP_COMPRESSED with snappy
            request.reply(serverResponse[0], { compression: { compressor: "snappy"}});
            currentStep++;
          } else if (currentStep == 1) {
            test.equal(server.isCompressed, true);
            // Acknowledge insertion using OP_COMPRESSED with snappy
            request.reply({ok:1, n: doc.documents.length, lastOp: new Date()}, { compression: { compressor: "snappy"}});
            currentStep++;
          } else if (currentStep == 2) {
            // Acknowledge update using OP_COMPRESSED with snappy
            test.equal(server.isCompressed, true);
            request.reply({ok:1, n: 1}, { compression: { compressor: "snappy"}});
            currentStep++;
          } else if (currentStep == 3) {
            // Acknowledge removal using OP_COMPRESSED with snappy
            test.equal(server.isCompressed, true);
            request.reply({ok:1, n: 1}, { compression: { compressor: "snappy"}});
            currentStep++;
          } else if (currentStep == 4) {
            test.equal(server.isCompressed, true);
            request.reply({ok:1}, { compression: {compressor: "snappy"}})
          }
        }
      });

    }).catch(function(err) {
      console.log(err)
    });

    // Attempt to connect
    var client = new Server({
      host: 'localhost',
      port: '37048',
      connectionTimeout: 5000,
      socketTimeout: 1000,
      size: 1,
      compression: { compressors: ['snappy', 'zlib']},
    });

    // Connect and try inserting, updating, and removing
    // All outbound messages from the driver will be uncompressed
    // Inbound messages from the server should be OP_COMPRESSED with snappy
    client.on('connect', function(_server) {
      _server.insert('test.test', [{a:1, created:new Date()}], function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.n);

        _server.update('test.test', {q: {a: 1}, u: {'$set': {b: 1}}}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          _server.remove('test.test', {q: {a: 1}}, function(err, r) {
            if (err) console.log(err)
            test.equal(null, err);
            test.equal(1, r.result.n);

            _server.command('system.$cmd', { ping: 1 }, function(err, result) {
              test.equal(null, err);
              test.equal(1, r.result.ok);

              client.destroy();
              setTimeout(function () {
                running = false
                test.done();
              }, 500);
            });    
          })
        })

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
      "compression": ['zlib'],
      "ok" : 1
    }
    var serverResponse = [extend(defaultServerResponse, {})];

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(37049, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();
          var doc = request.document;

          if (currentStep == 0) {
            test.equal(request.response.documents[0].compression[0], 'snappy');
            test.equal(request.response.documents[0].compression[1], 'zlib');
            test.equal(server.isCompressed, false);
            // Acknowledge connection using OP_COMPRESSED with zlib
            request.reply(serverResponse[0], { compression: { compressor: "zlib"}});
            currentStep++;
          } else if (currentStep == 1) {
            test.equal(server.isCompressed, true);
            // Acknowledge insertion using OP_COMPRESSED with zlib
            request.reply({ok:1, n: doc.documents.length, lastOp: new Date()}, { compression: { compressor: "zlib"}});
            currentStep++;
          } else if (currentStep == 2) {
            // Acknowledge update using OP_COMPRESSED with zlib
            test.equal(server.isCompressed, true);
            request.reply({ok:1, n: 1}, { compression: { compressor: "zlib"}});
            currentStep++;
          } else if (currentStep == 3) {
            // Acknowledge removal using OP_COMPRESSED with zlib
            test.equal(server.isCompressed, true);
            request.reply({ok:1, n: 1}, { compression: { compressor: "zlib"}});
          } else if (currentStep == 4) {
            test.equal(server.isCompressed, true);
            request.reply({ok:1}, { compression: {compressor: "zlib"}})
          }
        }
      });

    }).catch(function(err) {
      console.log(err)
    });

    // Attempt to connect
    var client = new Server({
      host: 'localhost',
      port: '37049',
      connectionTimeout: 5000,
      socketTimeout: 1000,
      size: 1,
      compression: { compressors: ['snappy', 'zlib']},
    });

    // Connect and try inserting, updating, and removing
    // All outbound messages from the driver will be uncompressed
    // Inbound messages from the server should be OP_COMPRESSED with zlib
    client.on('connect', function(_server) {
      _server.insert('test.test', [{a:1, created:new Date()}], function(err, r) {
        test.equal(null, err);
        test.equal(1, r.result.n);

        _server.update('test.test', {q: {a: 1}, u: {'$set': {b: 1}}}, function(err, r) {
          test.equal(null, err);
          test.equal(1, r.result.n);

          _server.remove('test.test', {q: {a: 1}}, function(err, r) {
            if (err) console.log(err)
            test.equal(null, err);
            test.equal(1, r.result.n);

            _server.command('system.$cmd', { ping: 1 }, function(err, result) {
              test.equal(null, err);
              test.equal(1, r.result.ok);

              client.destroy();
              setTimeout(function () {
                running = false
                test.done();
              }, 500);
            });    
          })
        })

      })
    });

    setTimeout(function () {
        client.connect();
    }, 100);
  }
}
