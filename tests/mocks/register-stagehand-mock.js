const Module = require('module');
const path = require('path');
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  if (request === '@browserbasehq/stagehand') {
    const mockPath = path.join(__dirname, 'node_modules', '@browserbasehq', 'stagehand');
    return require(mockPath);
  }
  return originalLoad.apply(this, arguments);
};

