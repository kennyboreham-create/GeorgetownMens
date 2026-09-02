const crypto = require('crypto');

function generateHex24() {
  return crypto.randomBytes(12).toString('hex');
}

class ObjectId {
  constructor(id) {
    if (id instanceof ObjectId) {
      this.id = id.id;
      return;
    }
    const value = id == null ? generateHex24() : String(id).trim();
    if (!value) {
      this.id = generateHex24();
      return;
    }
    this.id = value;
  }

  toString() {
    return this.id;
  }

  toJSON() {
    return this.id;
  }

  valueOf() {
    return this.id;
  }

  equals(other) {
    if (other == null) return false;
    return this.id === String(other);
  }

  inspect() {
    return this.id;
  }

  static isValid(value) {
    if (value instanceof ObjectId) return true;
    return /^[a-fA-F0-9]{24}$/.test(String(value || ''));
  }
}

module.exports = { ObjectId, generateHex24 };
