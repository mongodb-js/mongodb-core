'use strict';

const expect = require('chai').expect;
const bson = require('bson');
const wireProtocol2_6 = require('../../../lib/wireprotocol/2_6_support.js');
const wireProtocol3_2 = require('../../../lib/wireprotocol/3_2_support.js');

const MockPool = {};

MockPool.write = function(cmd, options, callback) {
  callback(null, cmd);
};

describe('WireProtocol', function() {
  it('2.6 should only set bypassDocumentValidation to true if explicitly set by user to true', function(done) {
    const options = { bypassDocumentValidation: true };
    wireProtocol2_6.prototype.insert(MockPool, '', '', bson, 'ops', options, function(err, data) {
      if (err) {
        done(err);
      }
      expect(data.query.bypassDocumentValidation).to.equal(true);
      done();
    });
  });

  it('2.6 should not set bypassDocumentValidation to true if not explicitly set by user to true', function(done) {
    const options = { bypassDocumentValidation: false };
    wireProtocol2_6.prototype.insert(MockPool, '', '', bson, 'ops', options, function(err, data) {
      if (err) {
        done(err);
      }
      expect(data.query.bypassDocumentValidation).to.equal(undefined);
      done();
    });
  });

  it('3.2 should only set bypassDocumentValidation to true if explicitly set by user to true', function(done) {
    const options = { bypassDocumentValidation: true };
    wireProtocol3_2.prototype.insert(MockPool, '', '', bson, 'ops', options, function(err, data) {
      if (err) {
        done(err);
      }
      expect(data.query.bypassDocumentValidation).to.equal(true);
      done();
    });
  });

  it('3.2 should not set bypassDocumentValidation to true if not explicitly set by user to true', function(done) {
    const options = { bypassDocumentValidation: false };
    wireProtocol3_2.prototype.insert(MockPool, '', '', bson, 'ops', options, function(err, data) {
      if (err) {
        done(err);
      }
      expect(data.query.bypassDocumentValidation).to.equal(undefined);
      done();
    });
  });
});
