'use strict';

const expect = require('chai').expect;
const mock = require('mongodb-mock-server');
const Server = require('../../../lib/topologies/server');
const MongoWriteConcernError = require('../../../lib/error').MongoWriteConcernError;
const sinon = require('sinon');
const Socket = require('net').Socket;

const test = {};
describe('Pool (unit)', function() {
  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer().then(mockServer => {
      test.server = mockServer;
    });
  });

  it('should throw a MongoWriteConcernError when a writeConcernError is present', function(done) {
    test.server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        return request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
      } else if (doc.insert) {
        return request.reply({
          ok: 1,
          writeConcernError: {
            code: 64,
            codeName: 'WriteConcernFailed',
            errmsg: 'waiting for replication timed out',
            errInfo: {
              wtimeout: true
            }
          }
        });
      }
    });

    const client = new Server(test.server.address());
    client.on('error', done);
    client.once('connect', () => {
      client.insert('fake.ns', { a: 1 }, (err, result) => {
        expect(err).to.exist;
        expect(result).to.not.exist;
        expect(err).to.be.instanceOf(MongoWriteConcernError);
        done();
      });
    });

    client.connect();
  });

  it('should not allow overriding `slaveOk` when connected to a mongos', function(done) {
    test.server.setMessageHandler(request => {
      const doc = request.document;
      if (doc.ismaster) {
        request.reply(Object.assign({ msg: 'isdbgrid' }, mock.DEFAULT_ISMASTER));
      } else if (doc.insert) {
        request.reply({ ok: 1 });
      }
    });

    const client = new Server(test.server.address());
    client.on('error', done);
    client.once('connect', () => {
      const poolWrite = sinon.spy(client.s.pool, 'write');

      client.insert('fake.ns', { a: 1 }, { slaveOk: true }, err => {
        expect(err).to.not.exist;

        const query = poolWrite.getCalls()[0].args[0];
        expect(query.slaveOk).to.be.false;

        client.s.pool.write.restore();
        done();
      });
    });

    client.connect();
  });

  it('should make sure to close connection if destroy is called mid-handshake', function(done) {
    class Deferred {
      constructor() {
        this.promise = new Promise((resolve, reject) => {
          this.resolve = resolve;
          this.reject = reject;
        });
      }
    }

    function getActiveSockets() {
      return new Set(process._getActiveHandles().filter(handle => handle instanceof Socket));
    }

    function diffSet(base, sub) {
      const ret = new Set();
      for (const item of base) {
        if (!sub.has(item)) {
          ret.add(item);
        }
      }

      return ret;
    }

    const requestReceived = new Deferred();
    const sendReply = new Deferred();

    test.server.setMessageHandler(request => {
      requestReceived.resolve();
      const doc = request.document;
      if (doc.ismaster) {
        sendReply.promise.then(() => {
          request.reply(Object.assign({}, mock.DEFAULT_ISMASTER));
        });
      }
    });

    const client = new Server(test.server.address());

    const previouslyActiveSockets = getActiveSockets();
    client.connect();

    requestReceived.promise.then(() => {
      client.destroy({}, () => {
        sendReply.resolve();
        setTimeout(() => {
          const activeSockets = diffSet(getActiveSockets(), previouslyActiveSockets);
          try {
            expect(activeSockets.size).to.equal(0);
            done();
          } catch (e) {
            console.dir(activeSockets, { depth: 0 });
            done(e);
          }
        }, 50);
      });
    });
  });
});
