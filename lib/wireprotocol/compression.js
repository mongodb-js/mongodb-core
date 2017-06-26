module.exports.compressorIDs = {
  snappy: 1,
  zlib: 2
}

module.exports.uncompressibleCommands = [
  'ismaster',
  'saslStart',
  'saslContinue',
  'getnonce',
  'authenticate',
  'createUser',
  'updateUser',
  'copydbSaslStart',
  'copydbgetnonce',
  'copydb'
];
