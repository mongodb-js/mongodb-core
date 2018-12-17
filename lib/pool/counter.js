'use strict';

function* counter(seed) {
  let count = seed || 0;
  while (true) {
    const newCount = count;
    count += 1;
    yield newCount;
  }
}

module.exports = { counter };
