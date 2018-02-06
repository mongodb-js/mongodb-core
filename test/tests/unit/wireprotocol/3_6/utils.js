'use strict';

const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const BSON = require('bson');
const Msg = require('../../../../../lib/connection/msg').Msg;
const Pool = require('../../../../../lib/connection/pool');
const shared = require('../../../../../lib/wireprotocol/shared');
const errors = require('../../../../../lib/error');
const parseHeader = shared.parseHeader;

chai.use(require('sinon-chai'));

class TestHarness {
  constructor() {
    this.sinon = sinon.createSandbox();
    this.MongoError = errors.MongoError;
    this.MongoNetworkError = errors.MongoNetworkError;
    beforeEach(() => this.beforeEach());
    afterEach(() => this.afterEach());
  }

  beforeEach() {
    this.bson = sinon.createStubInstance(BSON);
    this.pool = sinon.createStubInstance(Pool);
    this.pool.isConnected.returns(true);
    this.callback = sinon.stub();
  }

  afterEach() {
    this.sinon.restore();
  }
}

const OFFSETS = {
  FLAGS_FROM_START: 16,
  SEGMENTS_FROM_START: 20,
  PAYLOAD_FROM_SEGMENT: 1,
  ARGUMENT_FROM_PAYLOAD: 4
};

function parseSegmentAt(data, start) {
  let index = start;
  const payloadType = data.readUInt8(index);
  index += OFFSETS.PAYLOAD_FROM_SEGMENT;
  const payloadSize = data.readUInt32LE(index);

  const documents = [];
  let argument = undefined;

  if (payloadType === 0) {
    documents.push(data.slice(index, index + payloadSize));
  } else if (payloadType === 1) {
    const end = index + payloadSize;
    index += OFFSETS.ARGUMENT_FROM_PAYLOAD;
    argument = data.toString('utf8', index, data.indexOf(0, index));
    index += argument.length + 1;

    while (index < end) {
      const docSize = data.readUInt32LE(index);
      documents.push(data.slice(index, index + docSize));
      index += docSize;
    }
  }

  return { payloadType, payloadSize, argument, documents };
}

function parseOpMsg(data) {
  if (!Buffer.isBuffer(data) && Buffer.isBuffer(data[0])) {
    data = Buffer.concat(data);
  }

  const header = parseHeader(data);
  const flags = data.readInt32LE(OFFSETS.FLAGS_FROM_START);
  const segments = [];

  let index = OFFSETS.SEGMENTS_FROM_START;
  const totalDataLength = data.length;
  while (index < totalDataLength) {
    const segment = parseSegmentAt(data, index);
    segments.push(segment);
    index += segment.payloadSize + 1;
  }

  return { header, flags, segments, fullSize: data.length, rawData: data };
}

function expectMsgToHaveSingleQuery(msg) {
  return expect(msg)
    .to.be.an.instanceOf(Msg)
    .and.to.have.property('query')
    .that.is.an('array')
    .with.lengthOf(1)
    .that.has.property(0)
    .that.is.an('object');
}

module.exports = { parseOpMsg, TestHarness, expectMsgToHaveSingleQuery };
