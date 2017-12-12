'use strict';

const expect = require('chai').expect;
const Mongos = require('../../../../lib/topologies/mongos');
const mock = require('../../../mock');
const MongosFixture = require('../common').MongosFixture;

const test = new MongosFixture();

describe.only('EventEmitters (Mongos)', function() {
  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer().then(mockServer => {
      test.server = mockServer;
    });
  });

  it('should remove all event listeners when server is closed', {
    metadata: { requires: { topology: ['single'] } },
    test: function(done) {
      test.server.setMessageHandler(req => {
        const doc = req.document;
        if (doc.ismaster) {
          req.reply(Object.assign({}, test.defaultFields));
        }
      });

      const mongos = new Mongos([test.server.address()], {
        connectionTimeout: 30000,
        socketTimeout: 30000,
        haInterval: 500,
        size: 1
      });

      mongos.on('error', done);
      mongos.once('connect', () => {
        // After we connect, destroy/close the server
        mongos.destroy();
        mongos.disconnectedProxies.forEach(p => {
          // There should be no listeners remaining
          expect(p.listenerCount()).to.equal(0);
        });
        done();
      });

      mongos.connect();
    }
  });
});
