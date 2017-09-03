'use strict';
var ConfigurationBase = require('mongodb-test-runner').ConfigurationBase;
var inherits = require('util').inherits;
var f = require('util').format;

// Configuration for mongodb-core
var CoreConfiguration = function(options) {
  ConfigurationBase.call(this, options);

  this.type = 'core';
  this.topology = options.topology || this.defaultTopology;
};
inherits(CoreConfiguration, ConfigurationBase);

CoreConfiguration.prototype.defaultTopology = function(self, _mongo) {
  return new _mongo.Server({
    host: self.host,
    port: self.port
  });
};

CoreConfiguration.prototype.start = function(callback) {
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
};

CoreConfiguration.prototype.newTopology = function(opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }

  callback(null, this.topology(this, this.mongo));
};

CoreConfiguration.prototype.newConnection = function(opts, callback) {
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
};

module.exports = CoreConfiguration;
