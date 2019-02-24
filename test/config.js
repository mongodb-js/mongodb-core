'use strict';
const ConfigurationBase = require('mongodb-test-runner').ConfigurationBase;
const f = require('util').format;

const chai = require('chai');
chai.config.includeStack = true;
chai.config.showDiff = true;
chai.config.truncateThreshold = 0;

// Configuration for mongodb-core
class CoreConfiguration extends ConfigurationBase {
  constructor(options) {
    super(options);
    this.type = 'core';
    this.topology = options.topology || this.defaultTopology;
  }

  usingUnifiedTopology() {
    return !!process.env.MONGODB_UNIFIED_TOPOLOGY;
  }

  defaultTopology(self, _mongo, options) {
    options = Object.assign(
      {},
      {
        host: self.host,
        port: self.port
      },
      options
    );

    if (this.usingUnifiedTopology()) {
      return new _mongo.Topology(options);
    }

    return new _mongo.Server(options);
  }

  start(callback) {
    var self = this;
    if (this.skipStart) return callback();

    // Purge the database
    this.manager
      .purge()
      .then(function() {
        console.log('[purge the directories]');

        return self.manager.start();
      })
      .then(function() {
        console.log('[started the topology]');

        // Create an instance
        var server = self.topology(self, self.mongo);
        console.log('[get connection to topology]');

        // Set up connect
        server.once('connect', function() {
          console.log('[connected to topology]');

          // Drop the database
          server.command(f('%s.$cmd', self.db), { dropDatabase: 1 }, function() {
            console.log('[dropped database]');
            server.destroy();
            callback();
          });
        });

        // Connect
        console.log('[connecting to topology]');
        server.connect();
      })
      .catch(function(err) {
        callback(err);
      });
  }

  newTopology(options) {
    options = options || {};
    return this.topology(this, this.mongo, options);
  }

  newConnection(opts, callback) {
    if (typeof opts === 'function') {
      callback = opts;
      opts = {};
    }

    var server = this.topology(this, this.mongo);
    var errorHandler = function(err) {
      callback(err);
    };

    // Set up connect
    server.once('connect', function() {
      server.removeListener('error', errorHandler);
      callback(null, server);
    });

    server.once('error', errorHandler);

    // Connect
    try {
      server.connect();
    } catch (err) {
      server.removeListener('error', errorHandler);
      callback(err);
    }
  }
}

module.exports = CoreConfiguration;
