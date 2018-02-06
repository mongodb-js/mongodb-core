'use strict';

const expect = require('chai').expect;
const TestHarness = require('./utils').TestHarness;
const executeFind = require('../../../../../lib/wireprotocol/3_6_support/execute_find');
const ReadPreference = require('../../../../../lib/topologies/read_preference');

describe('Wire Protocol 3.6 Find', function() {
  const test = new TestHarness();

  const $db = 'darmok';
  const collection = 'jalad';
  const namespace = `${$db}.${collection}`;

  function expectMsgToHaveSingleQuery(msg) {
    return expect(msg)
      .to.have.property('query')
      .that.is.an('array')
      .with.lengthOf(1)
      .that.has.property(0)
      .that.is.an('object');
  }

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
        $db,
        find: collection,
        filter: cmd.query,
        sort: cmd.sort
      });
  });

  [
    'fields',
    'hint',
    'skip',
    'limit',
    'comment',
    'maxScan',
    'maxTimeMS',
    'min',
    'max',
    'returnKey',
    'showDiskLoc',
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
