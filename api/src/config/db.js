const { connectDB, disconnectDB, shouldUseMemory } = require('../db/odm');

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.disconnectDB = disconnectDB;
module.exports.shouldUseMemory = shouldUseMemory;
