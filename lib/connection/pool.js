"use strict";

var inherits = require('util').inherits
  , EventEmitter = require('events').EventEmitter
  , Connection = require('./connection')
  , Query = require('./commands').Query
  , Logger = require('./logger')
  , f = require('util').format
  , MongoError = require('../error')
  , bindToCurrentDomain = require('../connection/utils').bindToCurrentDomain;

var DISCONNECTED = 'disconnected';
var CONNECTING = 'connecting';
var CONNECTED = 'connected';
var DESTROYED = 'destroyed';

var _id = 0;

/**
 * Creates a new Pool instance
 * @class
 * @param {string} options.host The server host
 * @param {number} options.port The server port
 * @param {number} [options.size=5] Server connection pool size
 * @param {boolean} [options.keepAlive=true] TCP Connection keep alive enabled
 * @param {number} [options.keepAliveInitialDelay=0] Initial delay before TCP keep alive enabled
 * @param {boolean} [options.noDelay=true] TCP Connection no delay
 * @param {number} [options.connectionTimeout=0] TCP Connection timeout setting
 * @param {number} [options.socketTimeout=0] TCP Socket timeout setting
 * @param {boolean} [options.singleBufferSerializtion=true] Serialize into single buffer, trade of peak memory for serialization speed
 * @param {boolean} [options.ssl=false] Use SSL for connection
 * @param {boolean|function} [options.checkServerIdentity=true] Ensure we check server identify during SSL, set to false to disable checking. Only works for Node 0.12.x or higher. You can pass in a boolean or your own checkServerIdentity override function.
 * @param {Buffer} [options.ca] SSL Certificate store binary buffer
 * @param {Buffer} [options.cert] SSL Certificate binary buffer
 * @param {Buffer} [options.key] SSL Key file binary buffer
 * @param {string} [options.passPhrase] SSL Certificate pass phrase
 * @param {boolean} [options.rejectUnauthorized=false] Reject unauthorized server certificates
 * @param {boolean} [options.promoteLongs=true] Convert Long values from the db into Numbers if they fit into 53 bits
 * @fires Pool#connect
 * @fires Pool#close
 * @fires Pool#error
 * @fires Pool#timeout
 * @fires Pool#parseError
 * @return {Pool} A cursor instance
 */
var Pool = function(options) {
  var self = this;
  // Add event listener
  EventEmitter.call(this);
  // Set empty if no options passed
  this.options = options || {};
  this.size = typeof options.size == 'number' && !isNaN(options.size) ? options.size : 5;

  // Message handler
  this.messageHandler = options.messageHandler;
  // No bson parser passed in
  if(!options.bson) throw new Error("must pass in valid bson parser");
  // Contains all connections
  this.connections = [];
  this.available = [];
  this.monitorConnection = null;
  this.state = DISCONNECTED;
  this.queryQueue = [];
  // Round robin index
  this.index = 0;
  this.dead = false;
  // Logger instance
  this.logger = Logger('Pool', options);
  // If we are monitoring this server we will create an exclusive reserved socket for that
  this.monitoring = typeof options.monitoring == 'boolean' ? options.monitoring : false;
  // Pool id
  this.id = _id++;
  // Grouping tag used for debugging purposes
  this.tag = options.tag;
}

inherits(Pool, EventEmitter);

var errorHandler = function(self) {
  return function(err, connection) {
    if(self.logger.isDebug()) self.logger.debug(f('pool [%s] errored out [%s] with connection [%s]', this.dead, JSON.stringify(err), JSON.stringify(connection)));
    if(!self.dead) {
      self.state = DISCONNECTED;
      self.dead = true;
      self.destroy();
      self.emit('error', err, self);
    }
  }
}

var timeoutHandler = function(self) {
  return function(err, connection) {
    if(self.logger.isDebug()) self.logger.debug(f('pool [%s] timed out [%s] with connection [%s]', this.dead, JSON.stringify(err), JSON.stringify(connection)));
    if(!self.dead) {
      self.state = DISCONNECTED;
      self.dead = true;
      self.destroy();
      self.emit('timeout', err, self);
    }
  }
}

var closeHandler = function(self) {
  return function(err, connection) {
    if(self.logger.isDebug()) self.logger.debug(f('pool [%s] closed [%s] with connection [%s]', this.dead, JSON.stringify(err), JSON.stringify(connection)));
    if(!self.dead) {
      self.state = DISCONNECTED;
      self.dead = true;
      self.destroy();
      self.emit('close', err, self);
    }
  }
}

var parseErrorHandler = function(self) {
  return function(err, connection) {
    if(self.logger.isDebug()) self.logger.debug(f('pool [%s] errored out [%s] with connection [%s]', this.dead, JSON.stringify(err), JSON.stringify(connection)));
    if(!self.dead) {
      self.state = DISCONNECTED;
      self.dead = true;
      self.destroy();
      self.emit('parseError', err, self);
    }
  }
}

var connectHandler = function(self) {
  return function(connection) {
    self.connections.push(connection);
    self.available.push(connection);
    
    // We have connected to all servers
    if(self.connections.length == self.size) {
      if (self.monitoring === true) {
        // set aside the last connection for the monitor
        self.monitorConnection = self.connections[self.connections.length - 1];
      }
      
      self.state = CONNECTED;
      // Done connecting
      self.emit("connect", self);
    }
  }
}

/**
 * Destroy pool
 * @method
 */
Pool.prototype.destroy = function(err) {
  var self = this;
  
  this.state = DESTROYED;
  // Set dead
  this.dead = true;
  // Destroy all the connections
  this.connections.forEach(function(c) {
    // Destroy all event emitters
    ["close", "message", "error", "timeout", "parseError", "connect"].forEach(function(e) {
      c.removeAllListeners(e);
    });

    // Destroy the connection
    c.destroy();
  });
  
  // pass along destroy message to flush to ensure queries pending running and closed down properly
  if (err) { self.flush(err); }
  
  this.queryQueue = [];
  this.available = [];
  this.monitorConnection = null;
}

var execute = null;

try {
  execute = setImmediate;
} catch(err) {
  execute = process.nextTick;
}

/**
 * Connect pool
 * @method
 */
Pool.prototype.connect = function(_options) {
  var self = this;
  // Set to connecting
  this.state = CONNECTING
  // No dead
  this.dead = false;

  // Ensure we allow for a little time to setup connections
  var wait = 1;

  // Connect all sockets
  for(var i = 0; i < this.size; i++) {
    setTimeout(function() {
      execute(function() {
        self.options.messageHandler = self.messageHandler;
        var connection = new Connection(self.options);

        // Add all handlers
        connection.once('close', closeHandler(self));
        connection.once('error', errorHandler(self));
        connection.once('timeout', timeoutHandler(self));
        connection.once('parseError', parseErrorHandler(self));
        connection.on('connect', connectHandler(self));

        // Start connection
        connection.connect(_options);
      });
    }, wait);

    // wait for 1 miliseconds before attempting to connect, spacing out connections
    wait = wait + 1;
  }
}

/**
 * Get a pool connection (round-robin)
 * @method
 * @return {Connection}
 */
Pool.prototype.get = function(options) {
  options = options || {};

  // Set the current index
  this.index = this.index + 1;

  if(this.connections.length == 1) {
    return this.connections[0];
  } else if(this.monitoring && options.monitoring) {
    return this.connections[this.connections.length - 1];
  } else if(this.monitoring) {
    this.index = this.index % (this.connections.length - 1);
    return this.connections[this.index];
  } else {
    this.index = this.index % this.connections.length;
    return this.connections[this.index];
  }
}

/**
 * Reduce the poolSize to the provided max connections value
 * @method
 * @param {number} maxConnections reduce the poolsize to maxConnections
 */
Pool.prototype.capConnections = function(maxConnections) {
    while(this.connections.length > maxConnections) {
      // removes connections off the front so that our monitor socket (the last socket) is intact
      var connection = this.connections.shift();
      connection.removeAllListeners('close');
      connection.removeAllListeners('error');
      connection.removeAllListeners('timeout');
      connection.removeAllListeners('parseError');
      connection.removeAllListeners('connect');
      connection.destroy();
      
      // if this connection is in the available pool, make sure it's popped off the queue
      var index = this.available.indexOf(connection);
      if (index > -1) {
        this.available.splice(index, 1);
      }
    }
    
    if (this.index >= this.connections.length) {
      // Go back to the beggining of the pool if capping connections
      this.index = 0;
    }
}

/**
 * Get all pool connections
 * @method
 * @return {array}
 */
Pool.prototype.getAll = function() {
  return this.connections.slice(0);
}

/**
 * Is the pool connected
 * @method
 * @return {boolean}
 */
Pool.prototype.isConnected = function() {
  for(var i = 0; i < this.connections.length; i++) {
    if(!this.connections[i].isConnected()) return false;
  }

  return this.state == CONNECTED;
}

/**
 * Was the pool destroyed
 * @method
 * @return {boolean}
 */
Pool.prototype.isDestroyed = function() {
  return this.state == DESTROYED;
}

/**
 * Executes a command on the pool, waiting for the first available socket to process
 * Abstracts the inner workings of the pool from the pool users
 */
Pool.prototype.query = function(args, cb) {
  var self = this;
  
  // args.query - Query() object to utilize
  // args.callbacks - Callbacks to register callbacks on
  // args.monitor - Whether or not to pass to monitor socket
  
  if (args.monitoring === true && self.monitoring === true) {
    // execute query on the monitor socket immediately
    return self._execute(args, self.monitorConnection, cb);
  } else if (args.connection !== undefined) {
    // connection specified for some reason, execute utilizing that connection
    return self._execute(args, args.connection, cb);
  }
  
  args.cb = bindToCurrentDomain(cb);
  
  // our domain wrapped version won't have the properties, need to re-wrap or they are lost
  self._copyFnProps(cb, args.cb);
  
  self.queryQueue.push(args);
  
  self._processQueue();
}

// Processes the queue of queries and runs one if there is a query to run and a socket available to run it
Pool.prototype._processQueue = function() {
  var self = this;
  
  // check to see if there is queries in queue and available connections to process
  if (self.queryQueue.length === 0 || self.available.length === 0) { return; }
  
  var queryArgs = self.queryQueue.shift();
  var connection = self.available.shift();
  
  // wrap the callback so that we re-queue the connection and loop over the queue again after completion
  var complete = function(err, result) {
    // make our connection available again
    self.available.push(connection);
    
    // pass the returned values to our original callback
    queryArgs.cb.apply(null, arguments);
    
    // bounce off the event loop and continue processing
    execute(function() {
      self._processQueue();
    });
  }
  
  // each time we wrap the cb, we need to copy the props along
  self._copyFnProps(complete, queryArgs.cb);
  
  self._execute(queryArgs, connection, complete);
}

Pool.prototype._copyFnProps = function(fromCb, toCb) {
  var self = this;
  
  // copy values attached to the callback on to our new complete method
  // needed for cursor issues like raw, and documentsReturnedIn
  Object.keys(fromCb).forEach(function(val) {
    toCb[val] = fromCb[val];
  });
}

// Execute the query
Pool.prototype._execute = function(queryArgs, connection, cb) {
  var self = this;
  
  // write our query to the selected connection
  try {
    connection.write(queryArgs.query.toBin());
  } catch (err) {
    return cb(MongoError.create(err));
  }
  
  queryArgs.callbacks.register(queryArgs.query.requestId, cb);
}

// Flush all pending queries
Pool.prototype.flush = function(err) {
  var self = this;
  
  self.queryQueue.forEach(function(val) {
    val.cb(err);
  });
  
  self.queryQueue = [];
}

/**
 * A server connect event, used to verify that the connection is up and running
 *
 * @event Pool#connect
 * @type {Pool}
 */

/**
 * The server connection closed, all pool connections closed
 *
 * @event Pool#close
 * @type {Pool}
 */

/**
 * The server connection caused an error, all pool connections closed
 *
 * @event Pool#error
 * @type {Pool}
 */

/**
 * The server connection timed out, all pool connections closed
 *
 * @event Pool#timeout
 * @type {Pool}
 */

/**
 * The driver experienced an invalid message, all pool connections closed
 *
 * @event Pool#parseError
 * @type {Pool}
 */

module.exports = Pool;
