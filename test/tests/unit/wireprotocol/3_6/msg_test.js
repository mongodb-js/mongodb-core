'use strict';

const expect = require('chai').expect;
const Msg = require('../../../../../lib/connection/msg').Msg;
const BSON = require('bson');
const shared = require('../../../../../lib/wireprotocol/shared');
const opcodes = shared.opcodes;
const parseOpMsg = require('./utils').parseOpMsg;

describe('OP_MSG', function() {
  let bson;
  beforeEach(() => (bson = new BSON()));

  function validateHeaderAndFlags(message) {
    const header = message.header;
    expect(header)
      .to.have.property('length')
      .that.equals(message.fullSize);
    expect(header)
      .to.have.property('requestId')
      .that.is.a('number')
      .that.is.gt(0);
    expect(header)
      .to.have.property('responseTo')
      .that.equals(0);
    expect(header)
      .to.have.property('opCode')
      .that.equals(opcodes.OP_MSG);

    expect(message).to.have.property('flags', 0);
  }

  function testDocumentMessage(pojoMessage) {
    const msg = new Msg(bson, pojoMessage, {});
    const buffers = msg.toBin();
    const parsedMessage = parseOpMsg(buffers);

    validateHeaderAndFlags(parsedMessage);

    expect(parsedMessage.segments)
      .to.be.an('array')
      .and.to.have.a.lengthOf(1);

    const segment = parsedMessage.segments[0];

    expect(segment.payloadType).to.equal(0);
    expect(segment.documents).to.have.a.lengthOf(1);
    expect(bson.serialize(pojoMessage).equals(segment.documents[0])).to.equal(true);
  }

  function testSequenceMessage(argument, pojoMessage) {
    const msg = new Msg(bson, pojoMessage, {});
    const buffers = msg.toBin();
    const parsedMessage = parseOpMsg(buffers);

    validateHeaderAndFlags(parsedMessage);
    expect(parsedMessage.segments).to.have.a.lengthOf(2);

    const commandSegment = parsedMessage.segments[0];
    const documentsSegment = parsedMessage.segments[1];

    expect(commandSegment.payloadType).to.equal(0);
    const commandPojo = Object.assign({}, pojoMessage);
    delete commandPojo[argument];
    expect(commandSegment.documents).to.have.lengthOf(1);
    expect(commandSegment.documents[0].equals(bson.serialize(commandPojo))).to.equal(true);

    expect(documentsSegment.payloadType).to.equal(1);
    expect(documentsSegment.argument).to.equal(argument);
    expect(documentsSegment.documents).to.have.an.lengthOf(pojoMessage[argument].length);

    documentsSegment.documents.forEach((document, index) => {
      expect(document.equals(bson.serialize(pojoMessage[argument][index]))).to.equal(true);
    });
  }

  describe('insert tests', function() {
    it('should properly serialize the insert of a single document', function() {
      testDocumentMessage({
        insert: 'collectionName',
        documents: [{ _id: 'Document#1', example: 1 }],
        writeConcern: { w: 'majority' }
      });
    });

    it('should properly serialize the insert of two documents', function() {
      testSequenceMessage('documents', {
        insert: 'collectionName',
        documents: [
          { _id: 'Document#1', example: 1 },
          { _id: 'Document#2', example: 2 },
          { _id: 'Document#3', example: 3 }
        ],
        writeConcern: { w: 'majority' }
      });
    });
  });

  describe('update tests', function() {
    it('should properly serialize the update of a single document', function() {
      testDocumentMessage({
        update: 'collectionName',
        updates: [
          {
            q: { example: 1 },
            u: { $set: { example: 4 } }
          }
        ]
      });
    });

    it('should properly serialize the update of two documents', function() {
      testSequenceMessage('updates', {
        update: 'collectionName',
        updates: [
          {
            q: { example: 1 },
            u: { $set: { example: 4 } }
          },
          {
            q: { example: 2 },
            u: { $set: { example: 5 } }
          }
        ]
      });
    });
  });

  describe('delete tests', function() {
    it('should properly serialize the delete of a single document', function() {
      testDocumentMessage({
        delete: 'collectionName',
        deletes: [
          {
            q: { example: 3 },
            limit: 1
          }
        ]
      });
    });

    it('should properly serialize the delete of two documents', function() {
      testSequenceMessage('deletes', {
        delete: 'collectionName',
        deletes: [
          {
            q: { example: 3 },
            limit: 1
          },
          {
            q: { example: 4 },
            limit: 1
          }
        ]
      });
    });
  });

  it.skip('should properly serialize multiple commands');
});
