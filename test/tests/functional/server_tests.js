"use strict";

var f = require('util').format
  , Long = require('bson').Long;

exports['Should correctly reconnect to server with automatic reconnect enabled'] = {
  metadata: {
    requires: {
      topology: "single"
    }, 
    ignore: { travis:true }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: true
      , reconnectInterval: 50
    })

    // Test flags
    var emittedClose = false;

    // Add event listeners
    server.on('connect', function(_server) {
      var connection = _server.s.pool.connections[0];
      
      // Execute the command
      _server.command("system.$cmd", {ismaster: true}, {readPreference: new ReadPreference('primary'), connection: connection}, function(err, result) {
        test.equal(null, err)
        _server.s.currentReconnectRetry = 10;

        // Write garbage, force socket closure
        try {
          var a = new Buffer(100);
          for(var i = 0; i < 100; i++) a[i] = i;
          connection.write(a);
        } catch(err) {}

        // Ensure the server died
        setTimeout(function() {
          // Attempt a proper command
          _server.command("system.$cmd", {ismaster: true}, {readPreference: new ReadPreference('primary'), connection: connection}, function(err, result) {
            test.ok(err != null);
          });          
        }, 100);
      });
    });

    server.once('close', function() {
      emittedClose = true;
    });

    server.once('reconnect', function() {
      test.equal(true, emittedClose);
      test.equal(true, server.isConnected());
      test.equal(30, server.s.currentReconnectRetry);
      server.destroy();
      test.done();
    });

    // Start connection
    server.connect();
  }
}

exports['Should correctly reconnect to server with automatic reconnect disabled'] = {
  metadata: {
    requires: {
      topology: "single"
    }, 
    ignore: { travis:true }
  },

  test: function(configuration, test) {
    var Server = configuration.require.Server
      , ReadPreference = configuration.require.ReadPreference;

    // Attempt to connect
    var server = new Server({
        host: configuration.host
      , port: configuration.port
      , reconnect: false
      , size: 1
    })

    // Test flags
    var emittedClose = false;
    var emittedError = false;

    // Add event listeners
    server.on('connect', function(_server) {
      var connection = server.s.pool.connections[0];
      
      // Execute the command
      _server.command("system.$cmd", {ismaster: true}, {readPreference: new ReadPreference('primary'), connection: connection}, function(err, result) {
        test.equal(null, err)
        // Write garbage, force socket closure
        try {
          connection.destroy();
        } catch(err) {}

        process.nextTick(function() {
          // Attempt a proper command
          _server.command("system.$cmd", {ismaster: true}, {readPreference: new ReadPreference('primary'), connection: connection}, function(err, result) {
            test.ok(err != null);
          });
        });
      });
    });

    server.on('close', function() {
      emittedClose = true;
    });

    server.on('error', function() {
      emittedError = true;
    });

    setTimeout(function() {
      test.equal(true, emittedClose);
      test.equal(false, server.isConnected());
      server.destroy();
      test.done();
    }, 500);

    // Start connection
    server.connect();
  }
}