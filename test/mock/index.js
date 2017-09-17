var Server = require('./lib/server');

let mockServers = [];
const cleanup = (spy, callback) => {
  if (typeof spy === 'function') {
    callback = spy;
    spy = undefined;
  }

  if (spy) {
    const alreadyDrained = spy.connectionCount() === 0;
    const drainedPromise = !alreadyDrained
      ? new Promise(resolve => spy.once('drained', () => resolve()))
      : Promise.resolve();

    const cleanupPromise = Promise.all(mockServers.map(server => server.destroy()))
      .then(drainedPromise)
      .then(() => {
        mockServers = [];
      })
      .catch(err => {
        mockServers = [];
        throw err;
      });

    if (typeof callback !== 'function') {
      return cleanupPromise;
    }

    return cleanupPromise.then(() => callback(null, null)).catch(err => callback(err, null));
  } else {
    const cleanupPromise = Promise.all(mockServers.map(server => server.destroy()));
    if (typeof callback !== 'function') {
      return cleanupPromise;
    }

    return cleanupPromise.then(() => callback(null, null)).catch(err => callback(err, null));
  }
};

/*
 * Main module
 */
module.exports = {
  createServer: function(port, host, options) {
    options = options || {};
    let mockServer = new Server(port, host, options);
    mockServers.push(mockServer);
    return mockServer.start();
  },

  cleanup: cleanup
};
