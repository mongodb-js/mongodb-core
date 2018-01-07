'use strict';

const f = require('util').format;
const path = require('path');

const EnvironmentBase = require('mongodb-test-runner').EnvironmentBase;
const topologyManagers = require('mongodb-test-runner').topologyManagers;
const ServerManager = topologyManagers.Server;
const ReplSetManager = topologyManagers.ReplSet;
const ShardingManager = topologyManagers.Sharded;

class ReplicaSetEnvironment extends EnvironmentBase {
  constructor() {
    super();

    this.host = 'localhost';
    this.port = 31000;
    this.setName = 'rs';
    this.topology = (self, _mongo) => {
      return new _mongo.ReplSet([{ host: 'localhost', port: 31000 }], { setName: 'rs' });
    };

    const genReplsetConfig = (port, options) => {
      return Object.assign(
        {
          options: {
            bind_ip: 'localhost',
            port: port,
            dbpath: `${__dirname}/../db/${port}`
          }
        },
        options
      );
    };

    this.manager = new ReplSetManager(
      'mongod',
      [
        genReplsetConfig(31000, { tags: { loc: 'ny' } }),
        genReplsetConfig(31001, { tags: { loc: 'sf' } }),
        genReplsetConfig(31002, { tags: { loc: 'sf' } }),
        genReplsetConfig(31003, { tags: { loc: 'sf' } }),
        genReplsetConfig(31004, { tags: { loc: 'sf' } }),
        genReplsetConfig(31005, { arbiter: true })
      ],
      {
        replSet: 'rs'
      }
    );
  }
}

const genMongosConfig = (port, options) => {
  return Object.assign(
    {
      options: {
        bind_ip: 'localhost',
        port: port,
        dbpath: `${__dirname}/../db/${port}`,
        shardsvr: null
      }
    },
    options
  );
};

const genConfigServerConfig = (port, options) => {
  return Object.assign(
    {
      options: {
        bind_ip: 'localhost',
        port: port,
        dbpath: `${__dirname}/../db/${port}`
      }
    },
    options
  );
};

class ShardedEnvironment extends EnvironmentBase {
  constructor() {
    super();

    this.host = 'localhost';
    this.port = 51000;
    this.topology = (self, _mongo) => {
      return new _mongo.Mongos([{ host: 'localhost', port: 51000 }]);
    };

    this.manager = new ShardingManager({
      mongod: 'mongod',
      mongos: 'mongos'
    });
  }

  setup(callback) {
    const shardingManager = this.manager;
    const shardPromise = Promise.all([
      shardingManager.addShard(
        [genMongosConfig(31000), genMongosConfig(31001), genMongosConfig(31002, { arbiter: true })],
        {
          replSet: 'rs1'
        }
      ),
      shardingManager.addShard(
        [genMongosConfig(31010), genMongosConfig(31011), genMongosConfig(31012, { arbiter: true })],
        {
          replSet: 'rs2'
        }
      )
    ]);

    shardPromise
      .then(() =>
        shardingManager.addConfigurationServers(
          [
            genConfigServerConfig(35000),
            genConfigServerConfig(35001),
            genConfigServerConfig(35002)
          ],
          {
            replSet: 'rs3'
          }
        )
      )
      .then(() =>
        shardingManager.addProxies(
          [
            {
              bind_ip: 'localhost',
              port: 51000,
              configdb: 'localhost:35000,localhost:35001,localhost:35002'
            },
            {
              bind_ip: 'localhost',
              port: 51001,
              configdb: 'localhost:35000,localhost:35001,localhost:35002'
            }
          ],
          {
            binary: 'mongos'
          }
        )
      )
      .then(() => callback())
      .catch(err => callback(err));
  }
}

class AuthEnvironment extends EnvironmentBase {
  constructor() {
    super();

    this.host = 'localhost';
    this.port = 27017;
    this.manager = new ServerManager('mongod', {
      dbpath: path.join(path.resolve('db'), f('data-%d', 27017)),
      auth: null
    });
  }
}

class SingleEnvironment extends EnvironmentBase {
  constructor() {
    super();

    this.host = 'localhost';
    this.port = 27017;
    this.manager = new ServerManager('mongod', {
      dbpath: path.join(path.resolve('db'), f('data-%d', 27017))
    });
  }
}

class SnappyEnvironment extends EnvironmentBase {
  constructor() {
    super();

    this.host = 'localhost';
    this.port = 27017;
    this.manager = new ServerManager('mongod', {
      dbpath: path.join(path.resolve('db'), f('data-%d', 27017)),
      networkMessageCompressors: 'snappy'
    });
  }
}

module.exports = {
  single: SingleEnvironment,
  replicaset: ReplicaSetEnvironment,
  sharded: ShardedEnvironment,
  auth: AuthEnvironment,
  snappy: SnappyEnvironment
};
