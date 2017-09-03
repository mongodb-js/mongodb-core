'use strict';

var f = require('util').format;
var path = require('path');

var topologyManagers = require('mongodb-test-runner').topologyManagers,
  ServerManager = topologyManagers.Server,
  ReplSetManager = topologyManagers.ReplSet,
  ShardingManager = topologyManagers.Sharded;

var replicaSetEnvironment = function() {
  return {
    host: 'localhost',
    port: 31000,
    setName: 'rs',
    topology: function(self, _mongo) {
      return new _mongo.ReplSet([{ host: 'localhost', port: 31000 }], { setName: 'rs' });
    },
    manager: new ReplSetManager(
      'mongod',
      [
        {
          tags: { loc: 'ny' },
          options: {
            bind_ip: 'localhost',
            port: 31000,
            dbpath: f('%s/../db/31000', __dirname)
          }
        },
        {
          tags: { loc: 'sf' },
          options: {
            bind_ip: 'localhost',
            port: 31001,
            dbpath: f('%s/../db/31001', __dirname)
          }
        },
        {
          tags: { loc: 'sf ' },
          priority: 0,
          options: {
            bind_ip: 'localhost',
            port: 31002,
            dbpath: f('%s/../db/31002', __dirname)
          }
        },
        {
          tags: { loc: 'sf' },
          options: {
            bind_ip: 'localhost',
            port: 31003,
            dbpath: f('%s/../db/31003', __dirname)
          }
        },
        {
          arbiter: true,
          options: {
            bind_ip: 'localhost',
            port: 31004,
            dbpath: f('%s/../db/31004', __dirname)
          }
        }
      ],
      {
        replSet: 'rs'
      }
    )
  };
};

var shardedEnvironment = function() {
  var shardingManager = new ShardingManager({
    mongod: 'mongod',
    mongos: 'mongos'
  });

  shardingManager.addShard(
    [
      {
        options: {
          bind_ip: 'localhost',
          port: 31000,
          dbpath: f('%s/../db/31000', __dirname)
        }
      },
      {
        options: {
          bind_ip: 'localhost',
          port: 31001,
          dbpath: f('%s/../db/31001', __dirname)
        }
      },
      {
        arbiter: true,
        options: {
          bind_ip: 'localhost',
          port: 31002,
          dbpath: f('%s/../db/31002', __dirname)
        }
      }
    ],
    {
      replSet: 'rs1'
    }
  );

  shardingManager.addShard(
    [
      {
        options: {
          bind_ip: 'localhost',
          port: 31010,
          dbpath: f('%s/../db/31010', __dirname)
        }
      },
      {
        options: {
          bind_ip: 'localhost',
          port: 31011,
          dbpath: f('%s/../db/31011', __dirname)
        }
      },
      {
        arbiter: true,
        options: {
          bind_ip: 'localhost',
          port: 31012,
          dbpath: f('%s/../db/31012', __dirname)
        }
      }
    ],
    {
      replSet: 'rs2'
    }
  );

  shardingManager.addConfigurationServers(
    [
      {
        options: {
          bind_ip: 'localhost',
          port: 35000,
          dbpath: f('%s/../db/35000', __dirname)
        }
      },
      {
        options: {
          bind_ip: 'localhost',
          port: 35001,
          dbpath: f('%s/../db/35001', __dirname)
        }
      },
      {
        options: {
          bind_ip: 'localhost',
          port: 35002,
          dbpath: f('%s/../db/35002', __dirname)
        }
      }
    ],
    {
      replSet: 'rs3'
    }
  );

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
  );

  return {
    host: 'localhost',
    port: 51000,
    topology: function(self, _mongo) {
      return new _mongo.Mongos([{ host: 'localhost', port: 51000 }]);
    },
    manager: new ShardingManager()
  };
};

var authEnvironment = function() {
  return {
    host: 'localhost',
    port: 27017,
    manager: new ServerManager('mongod', {
      dbpath: path.join(path.resolve('db'), f('data-%d', 27017)),
      auth: null
    })
  };
};

var singleEnvironment = function() {
  return {
    host: 'localhost',
    port: 27017,
    manager: new ServerManager('mongod', {
      dbpath: path.join(path.resolve('db'), f('data-%d', 27017))
    })
  };
};

var snappyEnvironment = function() {
  return {
    host: 'localhost',
    port: 27017,
    manager: new ServerManager('mongod', {
      dbpath: path.join(path.resolve('db'), f('data-%d', 27017)),
      networkMessageCompressors: 'snappy'
    })
  };
};

module.exports = {
  single: singleEnvironment,
  replicaset: replicaSetEnvironment,
  sharded: shardedEnvironment,
  auth: authEnvironment,
  snappy: snappyEnvironment
};
