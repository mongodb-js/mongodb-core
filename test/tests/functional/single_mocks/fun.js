exports['Testing mock server'] = {
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

    // Boot the mock
    co(function*() {
      server = yield mockupdb.createServer(37019, 'localhost');

      // Primary state machine
      co(function*() {
        while(running) {
          var request = yield server.receive();

          // console.dir(request, {depth: 5})
          console.log("\n=======\nFUN DOT JAY ESS");
          console.dir(request.response, {depth:5});
          running = false
        }
      });

    });

    // Attempt to connect
    var client = new Server({
      host: 'localhost',
      port: '37019',
      connectionTimeout: 5000,
      socketTimeout: 1000,
      size: 1,
      compression: { compressors: ['snappy'], zlibCompressionLevel: -1},
    });


    client.once('connect', function(_server) {
      console.log('Connected')
      test.done()
    });

    client.connect()

  }

}
