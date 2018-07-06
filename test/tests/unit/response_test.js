'use strict';

const expect = require('chai').expect;
const MongoError = require('../../../lib/error').MongoError;
const mock = require('mongodb-mock-server');
const Server = require('../../../lib/topologies/server');
const Long = require('bson').Long;

const test = {};
describe('Response', function() {
  afterEach(() => mock.cleanup());
  beforeEach(() => {
    return mock.createServer().then(mockServer => {
      test.server = mockServer;
    });
  });

  it('should throw when document is error', {
    metadata: { requires: { topology: ['single'] } },
    test: function(done) {
      const errdoc = {
        ok: 0,
        errmsg: 'Cursor not found (namespace: "liveearth.entityEvents", id: 2018648316188432590).',
        code: 43,
        codeName: 'CursorNotFound',
        $clusterTime: {
          clusterTime: '6571069615193982970',
          signature: {
            hash: 't6IhRbNjfr9wxOPcsONmnQ7Q78I=',
            keyId: '6569656794291896332'
          }
        },
        operationTime: '6571069615193982970'
      };

      const client = new Server(test.server.address());

      let commands = [];
      test.server.setMessageHandler(request => {
        const doc = request.document;
        if (doc.ismaster) {
          request.reply(
            Object.assign({}, mock.DEFAULT_ISMASTER, {
              maxWireVersion: 6
            })
          );
        } else if (doc.find) {
          commands.push(doc);
          request.reply({
            cursor: {
              id: Long.fromNumber(1),
              ns: 'test.test',
              firstBatch: []
            },
            ok: 1
          });
        } else if (doc.getMore) {
          console.log('getMore');
          commands.push(doc);
          request.reply(errdoc);
        }
      });

      client.on('error', done);
      client.once('connect', () => {
        const cursor = client.cursor(
          'test.test',
          {
            find: 'test',
            query: {},
            batchSize: 2
          },
          { raw: true }
        );

        // Execute next
        cursor.next(function(err) {
          expect(err).to.exist;
          expect(err).to.be.instanceof(MongoError);
          expect(err.message).to.equal(errdoc.errmsg);

          client.destroy();
          done();
        });
      });
      client.connect();
    }
  });
});
