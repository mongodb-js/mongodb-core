'use strict';

const getReadPreference = require('../shared').getReadPreference;
const Msg = require('../../connection/msg').Msg;

function executeFind(bson, ns, cmd, cursorState, options) {
  // Ensure we have at least some options
  options = options || {};
  // Set the optional batchSize
  cursorState.batchSize = cmd.batchSize || cursorState.batchSize;

  // Get name of database
  const parts = ns.split(/\./);
  const $db = parts.shift();
  const $readPreference = getReadPreference(cmd, options).toJSON();

  // Build actual find command
  let findCmd = { find: parts.join('.') };

  // If we provided a filter
  if (cmd.query) {
    findCmd.filter = cmd.query['$query'] || cmd.query;
  }

  // I we provided a projection
  if (cmd.fields) {
    findCmd.projection = cmd.fields;
  }

  // If we have showDiskLoc set
  if (cmd.showDiskLoc) {
    findCmd.showRecordId = cmd.showDiskLoc;
  }

  [
    'hint',
    'skip',
    'limit',
    'comment',
    'maxScan',
    'maxTimeMS',
    'min',
    'max',
    'returnKey',
    'snapshot',
    'tailable',
    'oplogReplay',
    'noCursorTimeout',
    'partial',
    'collation'
  ].forEach(key => {
    if (cmd[key]) {
      findCmd[key] = cmd[key];
    }
  });

  // Check if we wish to have a singleBatch
  if (cmd.limit < 0) {
    findCmd.limit = Math.abs(cmd.limit);
    findCmd.singleBatch = true;
  }

  // Add a batchSize
  if (typeof cmd.batchSize === 'number') {
    if (cmd.batchSize < 0) {
      if (cmd.limit !== 0 && Math.abs(cmd.batchSize) < Math.abs(cmd.limit)) {
        findCmd.limit = Math.abs(cmd.batchSize);
      }

      findCmd.singleBatch = true;
    }

    findCmd.batchSize = Math.abs(cmd.batchSize);
  }

  const sort = parseSortField(cmd.sort);

  // Add sort to command
  if (sort) findCmd.sort = sort;

  // If we have awaitData set
  if (cmd.awaitData) findCmd.awaitData = cmd.awaitData;
  if (cmd.awaitdata) findCmd.awaitData = cmd.awaitdata;

  // If we have explain, we need to rewrite the find command
  // to wrap it in the explain command
  if (cmd.explain) {
    findCmd = {
      explain: findCmd
    };
  }

  // Did we provide a readConcern
  if (cmd.readConcern) findCmd.readConcern = cmd.readConcern;

  findCmd.$db = $db;
  findCmd.$readPreference = $readPreference;

  // Set up the serialize and ignoreUndefined fields
  const serializeFunctions =
    typeof options.serializeFunctions === 'boolean' ? options.serializeFunctions : false;
  const ignoreUndefined =
    typeof options.ignoreUndefined === 'boolean' ? options.ignoreUndefined : false;

  return new Msg(bson, findCmd, { serializeFunctions, ignoreUndefined, checkKeys: false });
}

function parseSortField(sort) {
  if (!Array.isArray(sort)) {
    return sort;
  }

  // Handle issue of sort being an Array
  const sortObject = {};

  if (sort.length > 0 && !Array.isArray(sort[0])) {
    var sortDirection = sort[1];
    // Translate the sort order text
    if (sortDirection === 'asc') {
      sortDirection = 1;
    } else if (sortDirection === 'desc') {
      sortDirection = -1;
    }

    // Set the sort order
    sortObject[sort[0]] = sortDirection;
  } else {
    for (var i = 0; i < sort.length; i++) {
      sortDirection = sort[i][1];
      // Translate the sort order text
      if (sortDirection === 'asc') {
        sortDirection = 1;
      } else if (sortDirection === 'desc') {
        sortDirection = -1;
      }

      // Set the sort order
      sortObject[sort[i][0]] = sortDirection;
    }
  }

  return sortObject;
}

module.exports = executeFind;
