'use strict';

try {
  new Function('return (async function foo() {return await Promise.resolve(42);})();')();
  require('../next/pool_spec_tests');
} catch (e) {
  console.warn(
    `Warning: Current Node Version ${
      process.version
    } is not high enough to support running pool_spec_tests.js`
  );
}
