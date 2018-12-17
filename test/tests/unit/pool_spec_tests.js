'use strict';

const fs = require('fs');
const path = require('path');
const expect = require('chai').expect;
require('chai').use(require('../../match_spec').default);
const Pool = require('../../../lib/pool').Pool;

const ALL_EVENTS = [
  'connectionPoolCreated',
  'connectionPoolClosed',
  'connectionCreated',
  'connectionReady',
  'connectionClosed',
  'connectionAcquisitionStarted',
  'connectionAcquisitionFailed',
  'connectionAcquired',
  'connectionReleased',
  'connectionPoolCleared'
];

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
  acquire: promisify(Pool.prototype.acquire),
  release: promisify(Pool.prototype.release),
  clear: promisify(Pool.prototype.clear),
  close: promisify(Pool.prototype.close)
};

async function destroyPool(pool) {
  pool.destroy();
  ALL_EVENTS.forEach(ev => pool.removeAllListeners(ev));
}

describe('Pool Spec Tests', function() {
  const threads = new Map();
  const pools = new Map();
  const connections = new Map();
  const poolEvents = [];

  afterEach(async () => {
    await Promise.all(Array.from(pools.values()).map(destroyPool));
    pools.clear();
    threads.clear();
    connections.clear();
    poolEvents.length = 0;
  });

  function createPool(options) {
    const id = pools.size + 1;
    const label = `pool${id}`;
    options = Object.assign({}, options, { enableConnectionMonitoring: true, id });

    const pool = new Pool(options);
    ALL_EVENTS.forEach(ev => {
      pool.on(ev, x => poolEvents.push(x));
    });

    pools.set(label, pool);
  }

  function getPool({ name, object }) {
    const poolName = object || 'pool1';
    const pool = pools.get(poolName);

    if (!pool) {
      throw new Error(`Attempted to run op ${name} on non-existent pool ${poolName}`);
    }

    return pool;
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
    acquire: async function(op) {
      const pool = getPool(op);

      const connection = await PROMISIFIED_POOL_FUNCTIONS.acquire.call(pool);

      if (op.label != null) {
        connections.set(op.label, connection);
      }
    },
    release: function(op) {
      const pool = getPool(op);
      const connection = connections.get(op.connection);
      const force = op.force;

      if (!connection) {
        throw new Error(`Attempted to release non-existient connection ${op.connection}`);
      }

      return PROMISIFIED_POOL_FUNCTIONS.release.call(pool, connection, force);
    },
    clear: function(op) {
      const pool = getPool(op);

      return PROMISIFIED_POOL_FUNCTIONS.clear.call(pool);
    },
    close: function(op) {
      const pool = getPool(op);

      return PROMISIFIED_POOL_FUNCTIONS.close.call(pool);
    },
    wait: function({ ms }) {
      return new Promise(r => setTimeout(r, ms));
    },
    start: function({ target }) {
      const thread = getThread(target);
      thread.start();
    },
    waitFor: async function({ name, target, suppressError }) {
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

      await operationFn(op);
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

  const specPath = path.join(__dirname, '../spec', 'connection-monitoring-and-pooling');
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
      const numberOfPools = singleTest.numberOfPools || 1;

      let actualError;

      try {
        const MAIN_THREAD_KEY = Symbol('Main Thread');
        const mainThread = new Thread();
        threads.set(MAIN_THREAD_KEY, mainThread);
        mainThread.start();

        for (let i = 0; i < numberOfPools; ++i) {
          createPool(poolOptions);
        }

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

      const actualEvents = poolEvents.filter(ev => ignoreEvents.indexOf(ev.type) < 0);

      expectedEvents.forEach((expected, index) => {
        const actual = actualEvents[index];
        expect(actual).to.matchSpec(expected);
      });
    });
  });
});
