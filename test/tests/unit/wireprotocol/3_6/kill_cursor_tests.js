'use strict';

const expect = require('chai').expect;
const makeSinonSandbox = require('./utils').makeSinonSandbox;
const errors = require('../../../../../lib/error');
const MongoError = errors.MongoError;
const MongoNetworkError = errors.MongoNetworkError;
const executeKillCursor = require('../../../../../lib/wireprotocol/3_6_support/execute_kill_cursor');
const Pool = require('../../../../../lib/connection/pool');
const BSON = require('bson');

describe('Wire Protocol 3.6 Kill Cursor', function() {
  const sinon = makeSinonSandbox();
  let bson, pool, callback;

  const $db = 'darmok';
  const collection = 'jalad';
  const namespace = `${$db}.${collection}`;

  const cursorState = {
    cursorId: 8675309
  };

  beforeEach(() => {
    bson = sinon.createStubInstance(BSON);
    pool = sinon.createStubInstance(Pool);
    pool.isConnected.returns(true);
    callback = sinon.stub();
  });

  it('should not call to pool if pool is not there, or pool is not connected', function() {
    executeKillCursor(bson, namespace, cursorState, undefined, callback);
    expect(pool.write).to.not.have.been.called;
    expect(callback).to.have.been.calledOnce.and.calledWithExactly(null, null);
    callback.reset();

    pool.isConnected.returns(false);

    executeKillCursor(bson, namespace, cursorState, pool, callback);
    expect(pool.write).to.not.have.been.called;
    expect(callback).to.have.been.calledOnce.and.calledWithExactly(null, null);
  });

  it('should catch any errors throw by pool.write, and pass them along to callback', function() {
    const err = new Error('this is a test error');
    pool.write.throws(err);

    expect(() => executeKillCursor(bson, namespace, cursorState, pool, callback)).to.not.throw();

    expect(callback).to.have.been.calledOnce.and.calledWithExactly(err, undefined);
  });

  it('should properly format command for killing cursor', function() {
    executeKillCursor(bson, namespace, cursorState, pool, callback);

    expect(pool.write).to.have.been.calledOnce.and.calledWithExactly(
      sinon.match({ query: sinon.match.any }),
      sinon.match.object,
      sinon.match.func
    );

    const msg = pool.write.lastCall.args[0];

    expect(msg)
      .to.have.property('query')
      .with.lengthOf(1)
      .that.has.property(0)
      .that.deep.includes({
        $db,
        cursors: [cursorState.cursorId],
        killCursors: collection
      });
  });

  describe('killCursorCallback', function() {
    let killCursorCallback;
    beforeEach(() => {
      executeKillCursor(bson, namespace, cursorState, pool, callback);
      killCursorCallback = pool.write.lastCall.args[2];
    });

    it('should take any errors from pool callback and pass them along', function() {
      const err = new Error('this is a test error');
      killCursorCallback(err);

      expect(callback).to.have.been.calledOnce.and.to.have.been.calledWithExactly(err, undefined);
    });

    it('should throw MongoNetworkError if responseFlag is nonzero', function() {
      const err = null;
      const response = {
        message: {
          documents: undefined,
          responseFlags: 1
        }
      };

      killCursorCallback(err, response);

      expect(callback).to.have.been.calledOnce;

      const returnedError = callback.lastCall.args[0];

      expect(returnedError)
        .to.be.an.instanceOf(MongoNetworkError)
        .and.to.have.property('message')
        .that.equals('cursor killed or timed out');
    });

    it('should throw MongoError if an invalid response comes back', function() {
      const err = null;
      const response = {
        message: {
          documents: [],
          responseFlags: 0
        }
      };

      killCursorCallback(err, response);

      expect(callback).to.have.been.calledOnce;

      const returnedError = callback.lastCall.args[0];

      expect(returnedError)
        .to.be.an.instanceOf(MongoError)
        .and.to.have.property('message')
        .that.equals(`invalid killCursors result returned for cursor id ${cursorState.cursorId}`);
    });

    it('should return first returned document if everything is fine', function() {
      const doc = {};
      const err = null;
      const response = {
        message: {
          documents: [doc],
          responseFlags: 0
        }
      };

      killCursorCallback(err, response);

      expect(callback).to.have.been.calledOnce.and.to.have.been.calledWithExactly(null, doc);
    });
  });
});
