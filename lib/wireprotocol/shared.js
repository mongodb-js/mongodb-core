"use strict"

var ReadPreference = require('../topologies/read_preference'),
  MongoError = require('../error');

var getReadPreference = function(cmd, options) {
  // Default to command version of the readPreference
  var readPreference = cmd.readPreference || new ReadPreference('primary');
  // If we have an option readPreference override the command one
  if(options.readPreference) {
    readPreference = options.readPreference;
  }

  if(typeof readPreference == 'string') {
    readPreference = new ReadPreference(readPreference);
  }

  if(!(readPreference instanceof ReadPreference)) {
    throw new MongoError('readPreference must be a ReadPreference instance');
  }

  return readPreference;
}

/**
 * Parses the header of a wire protocol message
 */
var readHeader = function(bson) {
  var header = {};

  // Each of these fields is 4 bytes long, so we read in 4 byte chunks
  header.messageLength = bson.readInt32LE(0);
  header.requestId = bson.readInt32LE(4);
  header.responseTo = bson.readInt32LE(8);
  header.opCode = bson.readInt32LE(12);

  return header;
}

module.exports = {
  getReadPreference: getReadPreference,
  readHeader: readHeader
}
