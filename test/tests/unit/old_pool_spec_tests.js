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
  'connectionDestroyed',
  'connectionPoolQueueFull',
  'connectionPoolQueueEntered',
  'connectionPoolQueueTimeout',
  'connectionPoolAcquire',
  'connectionPoolRelease',
  'connectionPoolCleared'
];

function reduceAsync(arr, reducer, seed) {
  return arr.reduce((p, item, index) => {
    return p.then(inner => reducer(inner, item, index));
  }, Promise.resolve(seed));
}

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

function resolveArgument(context, arg) {
  if (typeof arg !== 'object' || arg == null) {
    return arg;
  }

  if (Array.isArray(arg)) {
    return arg.map(value => resolveArgument(context, value));
  }

  if (!arg.$$ref) {
    return Object.keys(arg).reduce((memo, key) => {
      memo[key] = resolveArgument(context, arg[key]);
      return memo;
    }, {});
  }

  let $$ref = arg.$$ref;
  if (!Array.isArray($$ref)) {
    throw new Error(`$$ref=${$$ref} is not an array`);
  }

  return $$ref.reduce((value, refSegment) => value[refSegment], context);
}

async function destroyPool(pool) {
  pool.destroy();
  ALL_EVENTS.forEach(ev => pool.removeAllListeners(ev));
}

describe('Pool Spec Tests', function() {
  const poolEvents = [];
  const poolAfterEachCallbacks = [];

  let poolCounter = 0;

  afterEach(() => (poolCounter = 0));
  afterEach(() => (poolEvents.length = 0));
  afterEach(async () => {
    await reduceAsync(poolAfterEachCallbacks, (_, fn) => fn());
    poolAfterEachCallbacks.length = 0;
  });

  const OPERATION_FUNCTIONS = {
    createPool: function(target, [options]) {
      options = Object.assign({}, options, {
        enableConnectionMonitoring: true,
        id: poolCounter
      });

      poolCounter += 1;

      const pool = new Pool(options);
      ALL_EVENTS.forEach(ev => {
        pool.on(ev, x => poolEvents.push(x));
      });
      poolAfterEachCallbacks.push(() => destroyPool(pool));
      return pool;
    },
    acquire: function(target) {
      return PROMISIFIED_POOL_FUNCTIONS.acquire.apply(target);
    },
    release: function(target, args) {
      return PROMISIFIED_POOL_FUNCTIONS.release.apply(target, args);
    },
    clear: function(target) {
      return PROMISIFIED_POOL_FUNCTIONS.clear.apply(target);
    },
    close: function(target) {
      return PROMISIFIED_POOL_FUNCTIONS.close.apply(target);
    },
    wait: function(target, [ms]) {
      return new Promise(r => setTimeout(r, ms));
    },
    start: function(target, [thread]) {
      Thread.getThread(thread).start();
    },
    waitFor: async function(target, [thread, { suppressError } = {}]) {
      try {
        await Thread.getThread(thread).finish();
      } catch (e) {
        if (!suppressError) {
          throw e;
        }
      }
    }
  };

  class Thread {
    static getThread(name) {
      if (!Thread._threads[name]) {
        Thread._threads[name] = new Thread(name);
      }

      return Thread._threads[name];
    }

    static startThread(name) {
      const thread = Thread.getThread(name);
      thread.start();
    }

    static clear() {
      Thread._threads = {};
    }
    constructor(name) {
      this._name = name;
      this._killed = false;
      this._error = undefined;
      this._promise = new Promise(resolve => {
        this.start = () => setTimeout(resolve);
      });
    }

    run(context, op) {
      if (this._killed || this._error) {
        return;
      }
      this._promise = this._promise
        .then(() => this._runOperation(context, op))
        .catch(e => (this._error = e));
    }

    async _runOperation(context, op) {
      const operationFn = OPERATION_FUNCTIONS[op.name];
      if (!operationFn) {
        throw new Error(`Invalid command ${op.name}`);
      }
      const operationTarget = op.object ? context[op.object] : undefined;
      const operationArguments = resolveArgument(context, op.args || []);

      const returnValue = await operationFn(operationTarget, operationArguments);

      if (op.returnTo) {
        context[op.returnTo] = returnValue;
      }

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

  Thread.clear();
  afterEach(() => Thread.clear());

  const specPath = path.join(__dirname, '../spec', 'connection-monitoring-and-pooling');
  const testFiles = fs
    .readdirSync(specPath)
    .filter(x => x.indexOf('.json') !== -1)
    .map(x => [x, fs.readFileSync(path.join(specPath, x), 'utf8')])
    .map(x => [path.basename(x[0], '.json'), JSON.parse(x[1])])
    .filter(testFile => testFile[1].style === 'unit')
    .filter(testFile => testFile[1].version === 1);

  testFiles.forEach(testFile => {
    describe(testFile[0], async function() {
      const tests = testFile[1].tests;

      tests.forEach(singleTest => {
        const itFn = singleTest.only ? it.only : it;
        itFn(singleTest.description, async function() {
          if (!singleTest.operations) {
            return this.skip();
          }

          const operations = singleTest.operations;
          const expectedEvents = singleTest.events || [];
          const ignoreEvents = singleTest.ignore || [];
          const expectedError = singleTest.error;

          let actualError;
          const context = {};
          const MAIN_THREAD_SYMBOL = Symbol('MAIN THREAD');
          const mainThread = Thread.getThread(MAIN_THREAD_SYMBOL);
          mainThread.start();

          try {
            operations.forEach(op => {
              const threadName = op.thread || MAIN_THREAD_SYMBOL;
              Thread.getThread(threadName).run(context, op);
            });
            await mainThread.finish();
          } catch (e) {
            actualError = e;
          }

          if (expectedError) {
            const ee = resolveArgument(context, expectedError);
            if (!actualError) {
              expect(actualError).to.matchSpec(ee);
            } else {
              const ae = Object.assign({}, actualError, { message: actualError.message });
              expect(ae).to.matchSpec(ee);
            }
          } else if (actualError) {
            throw actualError;
          }

          const actualEvents = poolEvents.filter(ev => ignoreEvents.indexOf(ev.type) < 0);

          expectedEvents.forEach((expectedRaw, index) => {
            const expected = resolveArgument(context, expectedRaw);
            const actual = actualEvents[index];
            expect(actual).to.matchSpec(expected);
          });
        });
      });
    });
  });
});
