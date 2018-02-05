'use strict';

const expect = require('chai').expect;
const makeSinonSandbox = require('./utils').makeSinonSandbox;
const executeWrite = require('../../../../../lib/wireprotocol/3_6_support/execute_write');
const Pool = require('../../../../../lib/connection/pool');
const BSON = require('bson');
const MongoError = require('../../../../../lib/error').MongoError;

[
  { type: 'insert', opsField: 'documents' },
  { type: 'update', opsField: 'updates' },
  { type: 'delete', opsField: 'deletes' }
].forEach(opMeta => {
  const TYPE = opMeta.type;
  const OPSFIELD = opMeta.opsField;

  describe(`Wire Protocol 3.6 ${TYPE}`, function() {
    const sinon = makeSinonSandbox();
    let bson, pool, callback;

    beforeEach(() => {
      bson = sinon.createStubInstance(BSON);
      pool = sinon.createStubInstance(Pool);
      callback = sinon.stub();
    });

    it('should throw if no documents are provided', function() {
      const badValues = [
        0,
        1,
        -1,
        'darmok',
        'jalad',
        { delete: 'collection' },
        null,
        undefined,
        []
      ];
      badValues.forEach(badValue => {
        const failingFunction = () =>
          executeWrite(bson, pool, TYPE, OPSFIELD, 'darmok.jalad', badValue, {}, callback);
        const stringOfBadValue = JSON.stringify(badValue);
        expect(
          failingFunction,
          `Expected executeWrite to fail when ops === ${stringOfBadValue}, but it succeeded`
        )
          .to.throw(MongoError)
          .with.property('message')
          .that.equals('write operation must contain at least one document');
      });
    });

    it(`should properly split namespace and operations across $db, ${TYPE} and ${OPSFIELD}`, function() {
      const ops = [
        { temba: 'his arms wide' },
        { temba: 'at rest' },
        { shaka: 'when the walls fell' }
      ];

      executeWrite(pool, bson, TYPE, OPSFIELD, 'darmok.jalad', ops, callback);

      expect(pool.write).to.have.been.calledOnce.and.to.have.been.calledWith(
        sinon.match({ query: sinon.match.any }),
        sinon.match.any,
        callback
      );

      const msg = pool.write.firstCall.args[0];

      expect(msg)
        .to.have.property('query')
        .with.lengthOf(1)
        .that.has.property(0)
        .that.includes({
          $db: 'darmok',
          [TYPE]: 'jalad',
          [OPSFIELD]: ops
        });
    });

    it('should properly set the moreToCome flag for w: 0', function() {
      const ops = [
        { temba: 'his arms wide' },
        { temba: 'at rest' },
        { shaka: 'when the walls fell' }
      ];

      const options = {
        writeConcern: {
          w: 0
        }
      };

      executeWrite(pool, bson, TYPE, OPSFIELD, 'darmok.jalad', ops, options, callback);

      expect(pool.write).to.have.been.calledOnce;

      const msg = pool.write.firstCall.args[0];

      expect(msg).to.have.property('moreToCome', true);
    });

    // TODO: do we need to actually test this?
    describe.skip('option tests', function() {
      it('ordered');
      it('writeConcern');
      it('collation');
      it('bypassDocumentValidation');
      it('txnNumber');
      it('session');
      it('chckKeys');
      it('serializeFunctions');
      it('ignoreUndefined');
    });
  });
});
