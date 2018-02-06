'use strict';

const getReadPreference = require('../shared').getReadPreference;
const Msg = require('../../connection/msg').Msg;

function setupCommand(bson, ns, cmd, options) {
  // Set empty options object
  options = options || {};

  // Final query
  let finalCmd = {};
  for (let name in cmd) {
    finalCmd[name] = cmd[name];
  }

  // Build add db to command
  const parts = ns.split(/\./);
  finalCmd.$db = parts.shift();
  finalCmd.$readPreference = getReadPreference(cmd, options).toJSON();

  // Serialize functions
  const serializeFunctions =
    typeof options.serializeFunctions === 'boolean' ? options.serializeFunctions : false;

  // Set up the serialize and ignoreUndefined fields
  const ignoreUndefined =
    typeof options.ignoreUndefined === 'boolean' ? options.ignoreUndefined : false;

  return new Msg(bson, finalCmd, { serializeFunctions, ignoreUndefined, checkKeys: false });
}

module.exports = setupCommand;
