'use strict';

const expect = require('chai').expect;
const TestHarness = require('./utils').TestHarness;
const executeKillCursor = require('../../../../../lib/wireprotocol/3_6_support/execute_kill_cursor');

describe('Wire Protocol 3.6 Kill Cursor', function() {
  const test = new TestHarness();

  const $db = 'darmok';
  const collection = 'jalad';
  const namespace = `${$db}.${collection}`;

  const cursorState = {
    cursorId: 8675309
  };

  it('should not call to pool if pool is not there, or pool is not connected', function() {
    executeKillCursor(test.bson, namespace, cursorState, undefined, test.callback);
    expect(test.pool.write).to.not.have.been.called;
    expect(test.callback).to.have.been.calledOnce.and.calledWithExactly(null, null);
    test.callback.reset();

    test.pool.isConnected.returns(false);

    executeKillCursor(test.bson, namespace, cursorState, test.pool, test.callback);
    expect(test.pool.write).to.not.have.been.called;
    expect(test.callback).to.have.been.calledOnce.and.calledWithExactly(null, null);
  });

  it('should catch any errors throw by pool.write, and pass them along to callback', function() {
    const err = new Error('this is a test error');
    test.pool.write.throws(err);

    expect(() =>
      executeKillCursor(test.bson, namespace, cursorState, test.pool, test.callback)
    ).to.not.throw();

    expect(test.callback).to.have.been.calledOnce.and.calledWithExactly(err, undefined);
  });

  it('should properly format command for killing cursor', function() {
    executeKillCursor(test.bson, namespace, cursorState, test.pool, test.callback);

    expect(test.pool.write).to.have.been.calledOnce.and.calledWithExactly(
      test.sinon.match({ query: test.sinon.match.any }),
      test.sinon.match.object,
      test.sinon.match.func
    );

    const msg = test.pool.write.lastCall.args[0];

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
      executeKillCursor(test.bson, namespace, cursorState, test.pool, test.callback);
      killCursorCallback = test.pool.write.lastCall.args[2];
    });

    it('should take any errors from pool callback and pass them along', function() {
      const err = new Error('this is a test error');
      killCursorCallback(err);

      expect(test.callback).to.have.been.calledOnce.and.to.have.been.calledWithExactly(
        err,
        undefined
      );
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

      expect(test.callback).to.have.been.calledOnce;

      const returnedError = test.callback.lastCall.args[0];

      expect(returnedError)
        .to.be.an.instanceOf(test.MongoNetworkError)
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

      expect(test.callback).to.have.been.calledOnce;

      const returnedError = test.callback.lastCall.args[0];

      expect(returnedError)
        .to.be.an.instanceOf(test.MongoError)
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

      expect(test.callback).to.have.been.calledOnce.and.to.have.been.calledWithExactly(null, doc);
    });
  });
});
