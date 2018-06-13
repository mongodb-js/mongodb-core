'use strict';

const chai = require('chai');
const expect = chai.expect;
const bson = require('bson');
const sinon = require('sinon');
const Pool = require('../../../lib/connection/pool.js');
const wireProtocol2_6 = require('../../../lib/wireprotocol/2_6_support.js');
const wireProtocol3_2 = require('../../../lib/wireprotocol/3_2_support.js');

const fake_topology = 'fake_topology';
const fake_bson = {
  serialize: () => {},
  deserialize: () => {}
};

const pool = new Pool(fake_topology, { bson: fake_bson });
sinon.stub(pool, 'write');

describe('WireProtocol', function() {
  it('2.6 should only set bypassDocumentValidation to true if explicitly set by user to true', function() {
    testPoolWrite(true, new wireProtocol2_6(), true);
  });

  it('2.6 should not set bypassDocumentValidation to anything if not explicitly set by user to true', function() {
    testPoolWrite(false, new wireProtocol2_6(), undefined);
  });

  it('3.2 should only set bypassDocumentValidation to true if explicitly set by user to true', function() {
    testPoolWrite(true, new wireProtocol3_2(), true);
  });

  it('3.2 should not set bypassDocumentValidation to anything if not explicitly set by user to true', function() {
    testPoolWrite(false, new wireProtocol3_2(), undefined);
  });

  function testPoolWrite(bypassDocumentValidation, wireProtocol, expected) {
    const isMaster = {};
    const ns = 'fake.namespace';
    const ops = 'fake.ops';
    const options = { bypassDocumentValidation: bypassDocumentValidation };

    wireProtocol.insert(pool, isMaster, ns, bson, ops, options, () => {});

    if (expected) {
      expect(pool.write.lastCall.args[0])
        .to.have.nested.property('query.bypassDocumentValidation')
        .that.equals(expected);
    } else {
      expect(pool.write.lastCall.args[0]).to.not.have.nested.property(
        'query.bypassDocumentValidation'
      );
    }
  }
});
