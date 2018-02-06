'use strict';

const expect = require('chai').expect;
const TestHarness = require('./utils').TestHarness;
const expectMsgToHaveSingleQuery = require('./utils').expectMsgToHaveSingleQuery;
const executeGetMore = require('../../../../../lib/wireprotocol/3_6_support/execute_get_more');

describe('Wire Protocol 3.6 GetMore', function() {
  const test = new TestHarness();

  const $db = 'darmok';
  const collection = 'jalad';
  const namespace = `${$db}.${collection}`;

  let connection;

  beforeEach(() => {
    connection = { write: test.sinon.stub() };
  });

  it('should reflect the basic options on to the getMoreCommand', function() {
    const cursorState = {
      cmd: {},
      cursorId: 8675309
    };

    const BATCH_SIZE = -23000;

    executeGetMore(
      test.bson,
      namespace,
      cursorState,
      BATCH_SIZE,
      undefined,
      connection,
      test.callback
    );

    expect(connection.write).to.have.been.calledOnce;

    expectMsgToHaveSingleQuery(connection.write.lastCall.args[0]).to.deep.equal({
      $db,
      collection,
      batchSize: 23000,
      getMore: cursorState.cursorId
    });
  });

  it('should attach maxTimeMS', function() {
    const cursorState = {
      cmd: {
        tailable: true,
        maxAwaitTimeMS: 1001
      },
      cursorId: 8675309
    };

    const BATCH_SIZE = -23000;

    executeGetMore(
      test.bson,
      namespace,
      cursorState,
      BATCH_SIZE,
      undefined,
      connection,
      test.callback
    );

    expect(connection.write).to.have.been.calledOnce;

    expectMsgToHaveSingleQuery(connection.write.lastCall.args[0]).to.deep.equal({
      $db,
      collection,
      batchSize: 23000,
      getMore: cursorState.cursorId,
      maxTimeMS: cursorState.cmd.maxAwaitTimeMS
    });
  });

  describe('callback tests', function() {
    let queryCallback;

    beforeEach(() => {
      const cursorState = {
        cmd: {
          tailable: true,
          maxAwaitTimeMS: 1001
        },
        cursorId: 8675309
      };

      const BATCH_SIZE = -23000;

      executeGetMore(
        test.bson,
        namespace,
        cursorState,
        BATCH_SIZE,
        undefined,
        connection,
        test.callback
      );

      queryCallback = connection.write.lastCall.args[2];
    });

    it('should pass along any errors to the callback', function() {
      const err = new Error('test error 1');
      queryCallback(err);

      expect(test.callback).to.have.been.calledOnce.and.calledWithExactly(err);
    });

    it('should throw MongoNetworkError if responseFlag is nonzero', function() {
      const err = null;
      const response = {
        message: {
          documents: undefined,
          responseFlags: 1
        }
      };

      queryCallback(err, response);

      expect(test.callback).to.have.been.calledOnce;

      const returnedError = test.callback.lastCall.args[0];

      expect(returnedError)
        .to.be.an.instanceOf(test.MongoNetworkError)
        .and.to.have.property('message')
        .that.equals('cursor killed or timed out');
    });

    it('should return a MongoError if ok is 0', function() {
      const err = null;
      const badMsg = { ok: 0 };
      const response = {
        message: {
          documents: [badMsg]
        }
      };

      queryCallback(err, response);

      expect(test.callback).to.have.been.calledOnce;

      const returnedError = test.callback.lastCall.args[0];

      expect(returnedError)
        .to.be.an.instanceOf(test.MongoError)
        .and.to.have.property('message')
        .that.equals('n/a');
    });

    it('should return a valid document and connection to the callback', function() {
      const validDoc = { ok: 1, cursor: { id: 8675309 } };
      const err = null;
      const response = {
        message: {
          documents: [validDoc],
          connection: {}
        }
      };

      queryCallback(err, response);

      expect(test.callback).to.have.been.calledOnce.and.to.have.been.calledWithExactly(
        null,
        response.message.documents[0],
        response.message.connection
      );
    });
  });
});
