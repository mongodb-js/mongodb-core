'use strict';

const TestHarness = require('./utils').TestHarness;
const expectMsgToHaveSingleQuery = require('./utils').expectMsgToHaveSingleQuery;
const setupCommand = require('../../../../../lib/wireprotocol/3_6_support/setup_command');
const ReadPreference = require('../../../../../lib/topologies/read_preference');

describe('Wire Protocol 3.6 Command', function() {
  const test = new TestHarness();

  const $db = 'darmok';
  const collection = 'jalad';
  const namespace = `${$db}.${collection}`;

  it('should include all properties of a passed in command', function() {
    const cmd = {
      darmok: 'on the ocean',
      tanagra: 'on the ocean',
      raiAndJiri: 'at lunga',
      kiteo: 'his sails unfurled'
    };

    const msg = setupCommand(test.bson, namespace, cmd);

    const expectQuery = expectMsgToHaveSingleQuery(msg);

    expectQuery.to.not.equal(cmd);
    expectQuery.to.deep.include(cmd);
  });

  it('should add global fields to the command', function() {
    const cmd = {
      darmok: 'on the ocean',
      tanagra: 'on the ocean',
      raiAndJiri: 'at lunga',
      kiteo: 'his sails unfurled',
      readPreference: new ReadPreference('primaryPreferred')
    };

    const msg = setupCommand(test.bson, namespace, cmd);
    expectMsgToHaveSingleQuery(msg).to.deep.include({
      $db,
      $readPreference: cmd.readPreference.toJSON()
    });
  });
});
