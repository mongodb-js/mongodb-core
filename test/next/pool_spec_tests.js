'use strict';

const fs = require('fs');
const path = require('path');
const expect = require('chai').expect;

/// TODO: change import path
require('chai').use(require('../match_spec').default);
const Pool = require('../../lib/pool').Pool;
const EventEmitter = require('events').EventEmitter;

class Connection {
  constructor(options = {}) {
    this.generation = options.generation;
    this.id = options.id;
    this.maxIdleTimeMS = options.maxIdleTimeMS;
    this.poolId = options.poolId;
    this.address = options.address;
    this.readyToUse = false;
    this.lastMadeAvailable = undefined;
    this.callbacks = [];
  }

  get metadata() {
    return {
      id: this.id,
      generation: this.generation,
      poolId: this.poolId,
      address: this.adress
    };
  }

  timeIdle() {
    return this.readyToUse ? Date.now() - this.lastMadeAvailable : 0;
  }

  write(callback) {
    setTimeout(() => callback());
  }

  makeReadyToUse() {
    this.readyToUse = true;
    this.lastMadeAvailable = Date.now();
  }

  makeInUse() {
    this.readyToUse = false;
    this.lastMadeAvailable = undefined;
  }

  waitUntilConnect(callback) {
    if (this.readyToUse) {
      return callback(null, this);
    }

    this.callbacks.push(callback);
  }

  connect(callback) {
    this.callbacks.push(callback);
    setTimeout(() => {
      this.makeReadyToUse();
      this.callbacks.forEach(c => c(null, this));
      this.callbacks = [];
    });
  }

  destroy() {}
}

// TODO: change import path
const ALL_EVENTS = Object.values(require('../../lib/pool/events'))
  .filter(Ctor => Ctor.eventType)
  .map(Ctor => Ctor.eventType);

function promisify(fn) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      const cb = (err, value) => {
        if (err) {
          return reject(err);
        }
        return resolve(value);
      };
      fn.apply(this, [...args, cb]);
    });
  };
}

const PROMISIFIED_POOL_FUNCTIONS = {
  checkOut: promisify(Pool.prototype.checkOut),
  checkIn: promisify(Pool.prototype.checkIn),
  clear: promisify(Pool.prototype.clear),
  close: promisify(Pool.prototype.close)
};

async function destroyPool(pool) {
  await new Promise(r => pool.destroy(r));
  ALL_EVENTS.forEach(ev => pool.removeAllListeners(ev));
}

describe('Pool Spec Tests', function() {
  const threads = new Map();
  const connections = new Map();
  const poolEvents = [];
  const poolEventsEventEmitter = new EventEmitter();
  let pool = undefined;

  afterEach(async () => {
    if (pool) {
      await destroyPool(pool);
      pool = undefined;
    }
    threads.clear();
    connections.clear();
    poolEvents.length = 0;
    poolEventsEventEmitter.removeAllListeners();
  });

  function createPool(options) {
    const address = 'localhost:27017';
    options = Object.assign({}, options, { Connection, address });

    pool = new Pool(options);
    ALL_EVENTS.forEach(ev => {
      pool.on(ev, x => {
        poolEvents.push(x);
        poolEventsEventEmitter.emit('poolEvent');
      });
    });
  }

  function getThread(name) {
    let thread = threads.get(name);
    if (!thread) {
      thread = new Thread();
      threads.set(name, thread);
    }

    return thread;
  }

  const OPERATION_FUNCTIONS = {
    checkOut: async function(op) {
      const connection = await PROMISIFIED_POOL_FUNCTIONS.checkOut.call(pool);

      if (op.label != null) {
        connections.set(op.label, connection);
      }
    },
    checkIn: function(op) {
      const connection = connections.get(op.connection);
      const force = op.force;

      if (!connection) {
        throw new Error(`Attempted to release non-existient connection ${op.connection}`);
      }

      return PROMISIFIED_POOL_FUNCTIONS.checkIn.call(pool, connection, force);
    },
    clear: function() {
      return PROMISIFIED_POOL_FUNCTIONS.clear.call(pool);
    },
    close: function() {
      return PROMISIFIED_POOL_FUNCTIONS.close.call(pool);
    },
    wait: function({ ms }) {
      return new Promise(r => setTimeout(r, ms));
    },
    start: function({ target }) {
      const thread = getThread(target);
      thread.start();
    },
    waitForThread: async function({ name, target, suppressError }) {
      const threadObj = threads.get(target);

      if (!threadObj) {
        throw new Error(`Attempted to run op ${name} on non-existent thread ${target}`);
      }

      try {
        await threadObj.finish();
      } catch (e) {
        if (!suppressError) {
          throw e;
        }
      }
    },
    waitForEvent: function({ event, count }) {
      return new Promise(resolve => {
        function run() {
          if (poolEvents.filter(ev => ev.type === event).length >= count) {
            return resolve();
          }

          poolEventsEventEmitter.once('poolEvent', run);
        }
        run();
      });
    }
  };

  class Thread {
    constructor() {
      this._killed = false;
      this._error = undefined;
      this._promise = new Promise(resolve => {
        this.start = () => setTimeout(resolve);
      });
    }

    run(op) {
      if (this._killed || this._error) {
        return;
      }
      this._promise = this._promise
        .then(() => this._runOperation(op))
        .catch(e => (this._error = e));
    }

    async _runOperation(op) {
      const operationFn = OPERATION_FUNCTIONS[op.name];
      if (!operationFn) {
        throw new Error(`Invalid command ${op.name}`);
      }

      await operationFn(op, this);
      await new Promise(r => setTimeout(r));
    }

    async finish() {
      this._killed = true;
      try {
        await this._promise;
      } catch (e) {
        throw e;
      }

      if (this._error) {
        throw this._error;
      }
    }
  }

  const specPath = path.join(__dirname, '../tests/spec', 'connection-monitoring-and-pooling');
  const testFiles = fs
    .readdirSync(specPath)
    .filter(x => x.indexOf('.json') !== -1)
    .map(x => [x, fs.readFileSync(path.join(specPath, x), 'utf8')])
    .map(x => [path.basename(x[0], '.json'), JSON.parse(x[1])])
    .filter(testFile => testFile[1].style === 'unit')
    .filter(testFile => testFile[1].version === 1);

  testFiles.forEach(testFile => {
    const singleTest = testFile[1];
    const itFn = singleTest.only ? it.only : it;

    itFn(singleTest.description, async function() {
      const operations = singleTest.operations;
      const expectedEvents = singleTest.events || [];
      const ignoreEvents = singleTest.ignore || [];
      const expectedError = singleTest.error;
      const poolOptions = singleTest.poolOptions || {};

      let actualError;

      try {
        const MAIN_THREAD_KEY = Symbol('Main Thread');
        const mainThread = new Thread();
        threads.set(MAIN_THREAD_KEY, mainThread);
        mainThread.start();

        createPool(poolOptions);

        for (let idx in operations) {
          const op = operations[idx];

          const threadKey = op.thread || MAIN_THREAD_KEY;
          const thread = getThread(threadKey);

          if (thread) {
            await thread.run(op);
            await new Promise(r => setTimeout(r));
          } else {
            throw new Error(`Invalid thread ${threadKey}`);
          }
        }

        await mainThread.finish();
      } catch (e) {
        actualError = e;
      }

      const actualEvents = poolEvents.filter(ev => ignoreEvents.indexOf(ev.type) < 0);

      if (expectedError) {
        if (!actualError) {
          expect(actualError).to.matchSpec(expectedError);
        } else {
          const ae = Object.assign({}, actualError, { message: actualError.message });
          expect(ae).to.matchSpec(expectedError);
        }
      } else if (actualError) {
        throw actualError;
      }

      expectedEvents.forEach((expected, index) => {
        const actual = actualEvents[index];
        expect(actual).to.matchSpec(expected);
      });
    });
  });
});
