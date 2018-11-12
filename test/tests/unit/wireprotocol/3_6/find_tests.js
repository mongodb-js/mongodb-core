'use strict';

const TestHarness = require('./utils').TestHarness;
const expectMsgToHaveSingleQuery = require('./utils').expectMsgToHaveSingleQuery;
const executeFind = require('../../../../../lib/wireprotocol/3_6_support/execute_find');
const ReadPreference = require('../../../../../lib/topologies/read_preference');

describe('Wire Protocol 3.6 Find', function() {
  const test = new TestHarness();

  const $db = 'darmok';
  const collection = 'jalad';
  const namespace = `${$db}.${collection}`;

  it('should properly parse out namespace and readPreference', function() {
    const readPreference = new ReadPreference('secondary');

    const cmd = {
      readPreference,
      query: {
        shaka: 'when the walls fell'
      }
    };

    const msg = executeFind(test.bson, namespace, cmd, {}, {});

    expectMsgToHaveSingleQuery(msg).that.deep.includes({
      $db,
      $readPreference: readPreference.toJSON(),
      find: collection,
      filter: cmd.query
    });
  });

  it('will attach a sort object to the command', function() {
    const cmd = {
      query: {},
      sort: {
        a: 1,
        b: -1
      }
    };
    const msg = executeFind(test.bson, namespace, cmd, {}, {});

    expectMsgToHaveSingleQuery(msg)
      .that.has.property('sort')
      .that.equals(cmd.sort);
  });

  it('will attach a sort array to the command as a sort object', function() {
    const cmd = {
      query: {},
      sort: ['foo', 'asc']
    };
    const msg = executeFind(test.bson, namespace, cmd, {}, {});

    expectMsgToHaveSingleQuery(msg)
      .that.has.property('sort')
      .that.deep.equals({ foo: 1 });
  });

  it('will attach a sort array of arrays to the command as a sort object', function() {
    const cmd = {
      query: {},
      sort: [['foo', 'desc'], ['bar', 1], ['fizz', -1], ['buzz', 'asc']]
    };
    const msg = executeFind(test.bson, namespace, cmd, {}, {});

    expectMsgToHaveSingleQuery(msg)
      .that.has.property('sort')
      .that.deep.equals({ foo: -1, bar: 1, fizz: -1, buzz: 1 });
  });

  it('should wrap the entire command when explain is passed in', function() {
    const cmd = {
      query: { a: 1, b: 1 },
      sort: { a: -1 },
      explain: true
    };
    const msg = executeFind(test.bson, namespace, cmd, {}, {});

    expectMsgToHaveSingleQuery(msg)
      .that.includes.property('explain')
      .that.deep.includes({
        find: collection,
        filter: cmd.query,
        sort: cmd.sort
      });
  });

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
    'collation'
  ].forEach(option => {
    it(`should include the option ${option} if it is passed in on the command`, function() {
      const cmd = {
        query: { a: 1, b: 1 },
        [option]: true
      };
      const msg = executeFind(test.bson, namespace, cmd, {}, {});

      expectMsgToHaveSingleQuery(msg).that.includes.property(option, true);
    });
  });
});
