function hasOwn(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && !(value instanceof Date)
    && !(value instanceof RegExp)
    && value.constructor === Object;
}

function isOperatorObject(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key.startsWith('$'));
}

function toComparable(value) {
  if (value == null) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && typeof value.toJSON === 'function' && value.constructor?.name === 'ObjectId') {
    return String(value);
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  return value;
}

function valuesEqual(left, right) {
  if (left === right) return true;
  if (left == null || right == null) return left == null && right == null;
  if (left instanceof Date || right instanceof Date) {
    return toComparable(left) === toComparable(right);
  }
  if (left instanceof RegExp) return left.test(String(right));
  if (right instanceof RegExp) return right.test(String(left));
  if (typeof left === 'object' || typeof right === 'object') {
    return String(left) === String(right);
  }
  return left === right;
}

function arrayContains(arr, expected) {
  if (!Array.isArray(arr)) return false;
  if (expected instanceof RegExp) {
    return arr.some((item) => expected.test(String(item)));
  }
  return arr.some((item) => valuesEqual(item, expected));
}

function matchOperators(docValue, present, operators) {
  for (const [op, expected] of Object.entries(operators)) {
    if (op === '$eq') {
      if (!valuesEqual(docValue, expected)) return false;
      continue;
    }
    if (op === '$ne') {
      if (valuesEqual(docValue, expected)) return false;
      continue;
    }
    if (op === '$gt' || op === '$gte' || op === '$lt' || op === '$lte') {
      if (docValue == null) return false;
      const left = toComparable(docValue);
      const right = toComparable(expected);
      if (op === '$gt' && !(left > right)) return false;
      if (op === '$gte' && !(left >= right)) return false;
      if (op === '$lt' && !(left < right)) return false;
      if (op === '$lte' && !(left <= right)) return false;
      continue;
    }
    if (op === '$in') {
      const list = Array.isArray(expected) ? expected : [expected];
      const values = Array.isArray(docValue) ? docValue : [docValue];
      const matched = list.some((item) => values.some((value) => (
        item instanceof RegExp ? item.test(String(value)) : valuesEqual(value, item)
      )));
      if (!matched) return false;
      continue;
    }
    if (op === '$nin') {
      const list = Array.isArray(expected) ? expected : [expected];
      const values = Array.isArray(docValue) ? docValue : (present ? [docValue] : []);
      if (!present) continue;
      const matched = list.some((item) => values.some((value) => (
        item instanceof RegExp ? item.test(String(value)) : valuesEqual(value, item)
      )));
      if (matched) return false;
      continue;
    }
    if (op === '$exists') {
      const shouldExist = Boolean(expected);
      if (present !== shouldExist) return false;
      continue;
    }
    if (op === '$regex') {
      const regex = expected instanceof RegExp
        ? expected
        : new RegExp(String(expected), operators.$options || '');
      if (!regex.test(String(docValue ?? ''))) return false;
      continue;
    }
    if (op === '$options') continue;
    throw new Error(`Unsupported query operator: ${op}`);
  }
  return true;
}

function matchField(doc, key, condition) {
  const present = hasOwn(doc, key) && doc[key] !== undefined;
  const docValue = present ? doc[key] : undefined;

  if (condition instanceof RegExp) {
    if (Array.isArray(docValue)) return arrayContains(docValue, condition);
    return condition.test(String(docValue ?? ''));
  }

  if (isOperatorObject(condition)) {
    return matchOperators(docValue, present, condition);
  }

  if (Array.isArray(docValue) && !Array.isArray(condition)) {
    return arrayContains(docValue, condition);
  }

  return valuesEqual(docValue, condition);
}

function matchesQuery(doc, filter) {
  if (!filter || Object.keys(filter).length === 0) return true;

  for (const [key, condition] of Object.entries(filter)) {
    if (key === '$and') {
      if (!Array.isArray(condition) || !condition.every((part) => matchesQuery(doc, part))) {
        return false;
      }
      continue;
    }
    if (key === '$or') {
      if (!Array.isArray(condition) || !condition.some((part) => matchesQuery(doc, part))) {
        return false;
      }
      continue;
    }
    if (key === '$nor') {
      if (!Array.isArray(condition) || condition.some((part) => matchesQuery(doc, part))) {
        return false;
      }
      continue;
    }
    if (!matchField(doc, key, condition)) return false;
  }
  return true;
}

module.exports = {
  matchesQuery,
  isPlainObject,
  isOperatorObject,
  valuesEqual
};
