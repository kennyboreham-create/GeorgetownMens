const memory = new Map();

function collectionMap(name) {
  if (!memory.has(name)) memory.set(name, new Map());
  return memory.get(name);
}

function cloneValue(value) {
  if (value == null) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(cloneValue);
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate();
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = cloneValue(nested);
    }
    return out;
  }
  return value;
}

function resetMemoryStore() {
  memory.clear();
}

const memoryAdapter = {
  kind: 'memory',
  async getAll(collection) {
    return Array.from(collectionMap(collection).values()).map(cloneValue);
  },
  async get(collection, id) {
    const row = collectionMap(collection).get(String(id));
    return row ? cloneValue(row) : null;
  },
  async set(collection, id, data) {
    collectionMap(collection).set(String(id), cloneValue(data));
  },
  async delete(collection, id) {
    return collectionMap(collection).delete(String(id));
  }
};

let firestoreDb = null;

function setFirestoreDb(db) {
  firestoreDb = db;
}

function getFirestoreDb() {
  if (!firestoreDb) {
    throw new Error('Firestore is not connected.');
  }
  return firestoreDb;
}

function fromFirestoreValue(value) {
  if (value == null) return value;
  if (value && typeof value.toDate === 'function' && typeof value.seconds === 'number') {
    return value.toDate();
  }
  if (Array.isArray(value)) return value.map(fromFirestoreValue);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = fromFirestoreValue(nested);
    }
    return out;
  }
  return value;
}

function toFirestoreValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => toFirestoreValue(item));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested !== undefined) out[key] = toFirestoreValue(nested);
    }
    return out;
  }
  return value;
}

const firestoreAdapter = {
  kind: 'firestore',
  async getAll(collection) {
    const snap = await getFirestoreDb().collection(collection).get();
    return snap.docs.map((doc) => fromFirestoreValue(doc.data()));
  },
  async get(collection, id) {
    const snap = await getFirestoreDb().collection(collection).doc(String(id)).get();
    if (!snap.exists) return null;
    return fromFirestoreValue(snap.data());
  },
  async set(collection, id, data) {
    await getFirestoreDb().collection(collection).doc(String(id)).set(toFirestoreValue(data));
  },
  async delete(collection, id) {
    await getFirestoreDb().collection(collection).doc(String(id)).delete();
    return true;
  }
};

let activeAdapter = memoryAdapter;

function useMemoryAdapter() {
  activeAdapter = memoryAdapter;
  return activeAdapter;
}

function useFirestoreAdapter(db) {
  setFirestoreDb(db);
  activeAdapter = firestoreAdapter;
  return activeAdapter;
}

function getAdapter() {
  return activeAdapter;
}

function adapterKind() {
  return activeAdapter.kind;
}

module.exports = {
  getAdapter,
  adapterKind,
  useMemoryAdapter,
  useFirestoreAdapter,
  resetMemoryStore,
  setFirestoreDb
};
