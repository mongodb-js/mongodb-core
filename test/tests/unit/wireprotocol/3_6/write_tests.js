'use strict';

const expect = require('chai').expect;
const TestHarness = require('./utils').TestHarness;
const executeWrite = require('../../../../../lib/wireprotocol/3_6_support/execute_write');

[
  { type: 'insert', opsField: 'documents' },
  { type: 'update', opsField: 'updates' },
  { type: 'delete', opsField: 'deletes' }
].forEach(opMeta => {
  const TYPE = opMeta.type;
  const OPSFIELD = opMeta.opsField;

  describe(`Wire Protocol 3.6 ${TYPE}`, function() {
    const test = new TestHarness();

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
          executeWrite(
            test.bson,
            test.pool,
            TYPE,
            OPSFIELD,
            'darmok.jalad',
            badValue,
            {},
            test.callback
          );
        const stringOfBadValue = JSON.stringify(badValue);
        expect(
          failingFunction,
          `Expected executeWrite to fail when ops === ${stringOfBadValue}, but it succeeded`
        )
          .to.throw(test.MongoError)
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

      executeWrite(test.pool, test.bson, TYPE, OPSFIELD, 'darmok.jalad', ops, test.callback);

      expect(test.pool.write).to.have.been.calledOnce.and.to.have.been.calledWith(
        test.sinon.match({ query: test.sinon.match.any }),
        test.sinon.match.any,
        test.callback
      );

      const msg = test.pool.write.firstCall.args[0];

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

      executeWrite(
        test.pool,
        test.bson,
        TYPE,
        OPSFIELD,
        'darmok.jalad',
        ops,
        options,
        test.callback
      );

      expect(test.pool.write).to.have.been.calledOnce;

      const msg = test.pool.write.firstCall.args[0];

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
