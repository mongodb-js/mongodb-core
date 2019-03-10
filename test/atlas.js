'use strict';

console.log('starting atlas connectivity tests');

const Core = require('../index');
const parseConnectionString = Core.parseConnectionString;
const MongoCredentials = Core.MongoCredentials;

if (
  !(
    process.env.ATLAS_FREE &&
    process.env.ATLAS_REPL &&
    process.env.ATLAS_SHRD &&
    process.env.ATLAS_TLS11 &&
    process.env.ATLAS_TLS12
  )
) {
  console.log('Error: Paths for Atlas tests not found');
  process.exit(1);
}

const configs = [
  {
    name: 'ATLAS_REPL',
    url: process.env.ATLAS_REPL,
    Ctor: Core.ReplSet
  },
  {
    name: 'ATLAS_SHRD',
    url: process.env.ATLAS_SHRD,
    Ctor: Core.Mongos
  },
  {
    name: 'ATLAS_FREE',
    url: process.env.ATLAS_FREE,
    Ctor: Core.ReplSet
  },
  {
    name: 'ATLAS_TLS11',
    url: process.env.ATLAS_TLS11,
    Ctor: Core.ReplSet
  },
  {
    name: 'ATLAS_TLS12',
    url: process.env.ATLAS_TLS12,
    Ctor: Core.ReplSet
  }
];

function parse(url) {
  return new Promise((resolve, reject) => {
    parseConnectionString(url, (err, r) => (err ? reject(err) : resolve(r)));
  });
}

function topologyConnect(topology, auth) {
  return new Promise((resolve, reject) => {
    topology.on('connect', () => {
      if (!auth) {
        return resolve();
      }
      topology.auth(
        'default',
        'admin',
        auth.username,
        auth.password,
        err => (err ? reject(err) : resolve())
      );
    });
    topology.on('error', reject);
    topology.connect();
  });
}

function topologyIsMaster(topology) {
  return topologyRunCmd(topology, 'admin.$cmd', { ismaster: true });
}

function topologyFindCmd(topology) {
  return topologyRunCmd(topology, 'test.test', {
    find: 'test',
    limit: 1,
    batchSize: 1
  });
}

function topologyRunCmd(topology, ns, cmd) {
  return new Promise((resolve, reject) => {
    topology.command(ns, cmd, {}, (err, r) => (err ? reject(err) : resolve(r)));
  });
}

function runConnectionTest(config) {
  let topology;
  return Promise.resolve()
    .then(() => console.log(`testing ${config.name}`))
    .then(() => parse(config.url))
    .then(data => {
      const options = Object.assign({}, data.options);
      if (data.auth) {
        options.credentials = new MongoCredentials(data.auth);
      }

      return new config.Ctor(data.hosts, options);
    })
    .then(_topology => (topology = _topology))
    .then(() => topologyConnect(topology))
    .then(() => topologyIsMaster(topology))
    .then(() => topologyFindCmd(topology))
    .then(() => console.log(`${config.name} passed`))
    .catch(e => {
      console.log(`${config.name} failed`);
      throw e;
    });
}

configs
  .reduce((p, config) => p.then(() => runConnectionTest(config)), Promise.resolve())
  .then(() => {
    console.log('all tests passed');
    process.exit(0);
  })
  .catch(err => {
    console.log('test failed');
    console.dir({ err });
    process.exit(1);
  });
