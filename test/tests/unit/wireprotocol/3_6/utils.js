'use strict';

const shared = require('../../../../../lib/wireprotocol/shared');
const parseHeader = shared.parseHeader;
const chai = require('chai');
const sinon = require('sinon');

chai.use(require('sinon-chai'));

function makeSinonSandbox() {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  return sandbox;
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

module.exports = { parseOpMsg, makeSinonSandbox };
