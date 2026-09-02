const { ObjectId } = require('./objectId');
const { matchesQuery, isPlainObject } = require('./queryMatch');
const {
  getAdapter,
  adapterKind,
  useMemoryAdapter,
  useFirestoreAdapter,
  resetMemoryStore
} = require('./store');

const modelRegistry = new Map();

class DuplicateKeyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MongoServerError';
    this.code = 11000;
  }
}

function isObjectIdType(type) {
  return type === ObjectId || type === Types.ObjectId || type === Schema.Types.ObjectId;
}

function looksLikeFieldDef(def) {
  if (!isPlainObject(def) || !('type' in def)) return false;
  const t = def.type;
  if (t == null) return false;
  if (t === String || t === Number || t === Boolean || t === Date || t === Object) return true;
  if (isObjectIdType(t)) return true;
  if (Array.isArray(t)) return true;
  if (t instanceof Schema) return true;
  if (typeof t === 'function') return true;
  return false;
}

function parsePath(def) {
  if (def instanceof Schema) {
    return { kind: 'schema', schema: def };
  }
  if (Array.isArray(def)) {
    return { kind: 'array', item: parsePath(def[0] == null ? { type: Object } : def[0]) };
  }
  if (looksLikeFieldDef(def)) {
    const t = def.type;
    if (Array.isArray(t)) {
      return {
        kind: 'array',
        item: parsePath(t[0] == null ? { type: Object } : t[0]),
        options: def
      };
    }
    if (t instanceof Schema) {
      return { kind: 'schema', schema: t, options: def };
    }
    return {
      kind: 'field',
      type: t,
      options: def
    };
  }
  if (isPlainObject(def)) {
    const nested = new Schema(def);
    return { kind: 'schema', schema: nested };
  }
  return { kind: 'field', type: def, options: { type: def } };
}

class Schema {
  constructor(definition = {}, options = {}) {
    this.definition = definition;
    this.options = options || {};
    this.paths = {};
    this.uniquePaths = [];
    for (const [key, def] of Object.entries(definition)) {
      const path = parsePath(def);
      this.paths[key] = path;
      if (path.options?.unique) this.uniquePaths.push(key);
    }
    if (this.options.timestamps) {
      if (!this.paths.createdAt) this.paths.createdAt = { kind: 'field', type: Date, options: { type: Date } };
      if (!this.paths.updatedAt) this.paths.updatedAt = { kind: 'field', type: Date, options: { type: Date } };
    }
  }

  index() {
    return this;
  }
}

Schema.Types = { ObjectId };

const Types = { ObjectId };

function defaultFor(path) {
  const options = path.options || {};
  if (Object.prototype.hasOwnProperty.call(options, 'default')) {
    const value = options.default;
    return typeof value === 'function' ? value() : clonePlain(value);
  }
  if (path.kind === 'array') return [];
  if (path.kind === 'schema') return applySchema(path.schema, {}, { isNew: true });
  return undefined;
}

function clonePlain(value) {
  if (value == null) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clonePlain);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) out[key] = clonePlain(nested);
    return out;
  }
  return value;
}

function castField(path, value, doc) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (path.kind === 'array') {
    const list = Array.isArray(value) ? value : [];
    return list.map((item) => castField(path.item, item, doc));
  }
  if (path.kind === 'schema') {
    return applySchema(path.schema, isPlainObject(value) ? value : {}, { isNew: true });
  }
  const type = path.type;
  const options = path.options || {};
  let next = value;
  if (type === String) {
    next = String(next);
    if (options.trim) next = next.trim();
    if (options.lowercase) next = next.toLowerCase();
  } else if (type === Number) {
    next = Number(next);
  } else if (type === Boolean) {
    next = Boolean(next);
  } else if (type === Date) {
    next = next instanceof Date ? next : new Date(next);
  } else if (isObjectIdType(type) && next != null) {
    next = String(next);
  }
  return next;
}

function applySchema(schema, raw = {}, { isNew = false } = {}) {
  const out = {};
  const source = raw && typeof raw === 'object' ? raw : {};

  for (const [key, path] of Object.entries(schema.paths)) {
    let value = Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined;
    if (value === undefined && isNew) {
      const fallback = defaultFor(path);
      if (fallback !== undefined) value = fallback;
    }
    if (value === undefined) continue;
    out[key] = castField(path, value, out);
  }

  for (const [key, value] of Object.entries(source)) {
    if (key === '_id' || key === '__v') continue;
    if (schema.paths[key]) continue;
    if (value !== undefined) out[key] = clonePlain(value);
  }

  if (schema.options.timestamps && isNew) {
    const now = new Date();
    if (!out.createdAt) out.createdAt = now;
    out.updatedAt = out.updatedAt || now;
  }

  return out;
}

function validateRequired(schema, data) {
  for (const [key, path] of Object.entries(schema.paths)) {
    const required = path.options?.required;
    if (!required) continue;
    const isRequired = typeof required === 'function' ? required.call(data) : Boolean(required);
    if (!isRequired) continue;
    const value = data[key];
    if (value == null || value === '') {
      const error = new Error(`Path \`${key}\` is required.`);
      error.name = 'ValidationError';
      throw error;
    }
  }
}

function compareSort(a, b, sort) {
  for (const [key, dir] of Object.entries(sort || {})) {
    const left = a[key];
    const right = b[key];
    const direction = dir === -1 || dir === 'desc' ? -1 : 1;
    if (left == null && right == null) continue;
    if (left == null) return 1 * direction;
    if (right == null) return -1 * direction;
    const lv = left instanceof Date ? left.getTime() : left;
    const rv = right instanceof Date ? right.getTime() : right;
    if (lv < rv) return -1 * direction;
    if (lv > rv) return 1 * direction;
  }
  return 0;
}

function applySelect(data, select) {
  if (!select) return data;
  const fields = String(select).split(/\s+/).filter(Boolean);
  const isExclusion = fields.every((field) => field.startsWith('-'));
  if (isExclusion) {
    const omit = new Set(fields.map((field) => field.slice(1)));
    const out = {};
    for (const [key, value] of Object.entries(data)) {
      if (!omit.has(key)) out[key] = value;
    }
    return out;
  }
  const include = new Set(fields.map((field) => field.replace(/^\+/, '')));
  include.add('_id');
  const out = {};
  for (const key of include) {
    if (Object.prototype.hasOwnProperty.call(data, key)) out[key] = data[key];
  }
  return out;
}

function wrapSubdocs(value, path) {
  if (!path || path.kind !== 'array') return value;
  if (!Array.isArray(value)) return value;
  const item = path.item;
  const wantsId = item?.kind === 'schema' && item.schema?.options?._id !== false;
  const wrapped = value.map((entry) => {
    if (item?.kind === 'schema' && entry && typeof entry === 'object') {
      if (wantsId && !entry._id) entry._id = String(new ObjectId());
      if (item.schema) {
        for (const [nestedKey, nestedPath] of Object.entries(item.schema.paths)) {
          if (nestedPath.kind === 'array') {
            entry[nestedKey] = wrapSubdocs(entry[nestedKey] || [], nestedPath);
          }
        }
      }
    }
    return entry;
  });
  wrapped.id = (id) => wrapped.find((entry) => entry && String(entry._id) === String(id)) || null;
  return wrapped;
}

function unwrap(value) {
  if (value == null) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(unwrap);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      if (typeof nested === 'function') continue;
      if (key.startsWith('$')) continue;
      out[key] = unwrap(nested);
    }
    return out;
  }
  return value;
}

function persistable(doc) {
  const raw = {};
  for (const [key, value] of Object.entries(doc)) {
    if (typeof value === 'function') continue;
    if (key.startsWith('$')) continue;
    if (value === undefined) continue;
    raw[key] = unwrap(value);
  }
  raw._id = String(doc._id);
  return raw;
}

async function enforceUnique(model, data, { excludeId } = {}) {
  for (const path of model.schema.uniquePaths) {
    const value = data[path];
    if (value == null || value === '') continue;
    const matches = (await getAdapter().getAll(model.collectionName))
      .filter((row) => String(row._id) !== String(excludeId || ''))
      .filter((row) => matchesQuery(row, { [path]: value }));
    if (matches.length) {
      throw new DuplicateKeyError(`E11000 duplicate key error on ${model.modelName}.${path}`);
    }
  }
}

class Document {
  constructor(model, data, { isNew = true } = {}) {
    this.$model = () => model;
    this.$isNew = isNew;
    const prepared = { ...data };
    if (!prepared._id) prepared._id = String(new ObjectId());
    prepared._id = String(prepared._id);
    Object.assign(this, prepared);
    this.id = this._id;
    this.#wrapArrays();
  }

  #wrapArrays() {
    const model = this.$model();
    for (const [key, path] of Object.entries(model.schema.paths)) {
      if (path.kind === 'array') {
        this[key] = wrapSubdocs(this[key] || [], path);
      }
    }
  }

  markModified() {
    return this;
  }

  toObject() {
    const raw = persistable(this);
    raw.id = raw._id;
    return clonePlain(raw);
  }

  toJSON() {
    return this.toObject();
  }

  async save() {
    const model = this.$model();
    const isNew = this.$isNew;
    if (model.schema.options.timestamps) {
      this.updatedAt = new Date();
      if (isNew && !this.createdAt) this.createdAt = this.updatedAt;
    }
    const data = persistable(this);
    applyDefaultsOnMissing(model.schema, data);
    validateRequired(model.schema, data);
    await enforceUnique(model, data, { excludeId: isNew ? null : data._id });
    await getAdapter().set(model.collectionName, data._id, data);
    this.$isNew = false;
    Object.assign(this, data);
    this.id = this._id;
    this.#wrapArrays();
    return this;
  }

  async deleteOne() {
    const model = this.$model();
    await getAdapter().delete(model.collectionName, this._id);
    return { acknowledged: true, deletedCount: 1 };
  }

  async populate(path, select) {
    await populateDocs(this.$model(), [this], path, select);
    return this;
  }
}

function applyDefaultsOnMissing(schema, data) {
  for (const [key, path] of Object.entries(schema.paths)) {
    if (data[key] !== undefined) continue;
    const fallback = defaultFor(path);
    if (fallback !== undefined) data[key] = fallback;
  }
}

async function populateDocs(model, docs, pathName, select) {
  const path = model.schema.paths[pathName];
  if (!path || !docs.length) return docs;
  const refName = path.options?.ref || path.item?.options?.ref;
  if (!refName) return docs;
  const Ref = modelRegistry.get(refName);
  if (!Ref) return docs;

  const ids = [...new Set(
    docs
      .map((doc) => doc[pathName])
      .filter((id) => id != null && typeof id !== 'object')
      .map(String)
  )];
  if (!ids.length) return docs;

  const related = await Ref.find({ _id: { $in: ids } });
  const byId = new Map(related.map((item) => [String(item._id), item]));
  for (const doc of docs) {
    const current = doc[pathName];
    if (current == null || typeof current === 'object') continue;
    const found = byId.get(String(current));
    if (!found) {
      doc[pathName] = null;
      continue;
    }
    if (select) {
      doc[pathName] = new Document(Ref, applySelect(found.toObject(), select), { isNew: false });
    } else {
      doc[pathName] = found;
    }
  }
  return docs;
}

class Query {
  constructor(model, filter = {}, { findOne = false, byId = null } = {}) {
    this.model = model;
    this.filter = filter || {};
    this._findOne = findOne;
    this._byId = byId;
    this._sort = null;
    this._select = null;
    this._lean = false;
    this._populate = [];
  }

  sort(sort) {
    this._sort = sort;
    return this;
  }

  select(select) {
    this._select = select;
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  populate(path, select) {
    this._populate.push({ path, select });
    return this;
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }

  async exec() {
    const adapter = getAdapter();
    let rows;
    if (this._byId) {
      const row = await adapter.get(this.model.collectionName, this._byId);
      rows = row ? [row] : [];
    } else if (this.filter && this.filter._id && typeof this.filter._id !== 'object') {
      const row = await adapter.get(this.model.collectionName, this.filter._id);
      rows = row ? [row] : [];
      rows = rows.filter((row) => matchesQuery(row, this.filter));
    } else {
      rows = await adapter.getAll(this.model.collectionName);
      rows = rows.filter((row) => matchesQuery(row, this.filter));
    }

    if (this._sort) rows.sort((a, b) => compareSort(a, b, this._sort));

    let docs = rows.map((row) => new Document(this.model, row, { isNew: false }));
    for (const pop of this._populate) {
      await populateDocs(this.model, docs, pop.path, pop.select);
    }
    if (this._select) {
      docs = docs.map((doc) => {
        const selected = applySelect(persistable(doc), this._select);
        const next = new Document(this.model, selected, { isNew: false });
        for (const pop of this._populate) {
          if (doc[pop.path] !== undefined) next[pop.path] = doc[pop.path];
        }
        return next;
      });
    }

    if (this._lean) {
      const plain = docs.map((doc) => doc.toObject());
      return this._findOne ? (plain[0] || null) : plain;
    }
    return this._findOne ? (docs[0] || null) : docs;
  }
}

function pluralize(name) {
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  if (lower.endsWith('s')) return lower;
  return `${lower}s`;
}

function model(name, schema, collectionName) {
  const collection = collectionName || pluralize(name);

  class ModelDocument extends Document {
    constructor(data) {
      const applied = applySchema(schema, data || {}, { isNew: true });
      super(Model, applied, { isNew: true });
    }
  }

  const Model = function ModelConstructor(data) {
    return new ModelDocument(data);
  };
  Model.modelName = name;
  Model.schema = schema;
  Model.collectionName = collection;
  Model.collection = { name: collection };

  Model.create = async function create(data) {
    const doc = new Model(data);
    await doc.save();
    return doc;
  };

  Model.find = function find(filter = {}) {
    return new Query(Model, filter);
  };

  Model.findOne = function findOne(filter = {}) {
    return new Query(Model, filter, { findOne: true });
  };

  Model.findById = function findById(id) {
    if (id == null || id === '') {
      return new Query(Model, { _id: '__missing__' }, { findOne: true, byId: '__missing__' });
    }
    return new Query(Model, { _id: String(id) }, { findOne: true, byId: String(id) });
  };

  Model.countDocuments = async function countDocuments(filter = {}) {
    const rows = await getAdapter().getAll(collection);
    return rows.filter((row) => matchesQuery(row, filter)).length;
  };

  Model.exists = async function exists(filter = {}) {
    const rows = await getAdapter().getAll(collection);
    const found = rows.find((row) => matchesQuery(row, filter));
    return found ? { _id: found._id } : null;
  };

  Model.distinct = async function distinct(field, filter = {}) {
    const rows = await getAdapter().getAll(collection);
    const matched = rows.filter((row) => matchesQuery(row, filter));
    const values = [];
    for (const row of matched) {
      const value = row[field];
      if (Array.isArray(value)) values.push(...value);
      else if (value !== undefined) values.push(value);
    }
    return [...new Set(values.map((item) => (item instanceof Date ? item : item)))];
  };

  Model.deleteOne = async function deleteOne(filter = {}) {
    const rows = await getAdapter().getAll(collection);
    const found = rows.find((row) => matchesQuery(row, filter));
    if (!found) return { acknowledged: true, deletedCount: 0 };
    await getAdapter().delete(collection, found._id);
    return { acknowledged: true, deletedCount: 1 };
  };

  Model.deleteMany = async function deleteMany(filter = {}) {
    const rows = await getAdapter().getAll(collection);
    const matched = rows.filter((row) => matchesQuery(row, filter));
    for (const row of matched) {
      await getAdapter().delete(collection, row._id);
    }
    return { acknowledged: true, deletedCount: matched.length };
  };

  Model.findByIdAndDelete = async function findByIdAndDelete(id) {
    const doc = await Model.findById(id);
    if (!doc) return null;
    await getAdapter().delete(collection, doc._id);
    return doc;
  };

  Model.updateOne = async function updateOne(filter, update = {}) {
    const rows = await getAdapter().getAll(collection);
    const found = rows.find((row) => matchesQuery(row, filter));
    if (!found) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    const next = clonePlain(found);
    if (update.$set) applyUpdateSet(next, update.$set);
    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) unsetPath(next, key);
    }
    if (!update.$set && !update.$unset) Object.assign(next, update);
    if (schema.options.timestamps) next.updatedAt = new Date();
    await getAdapter().set(collection, next._id, next);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  };

  modelRegistry.set(name, Model);
  return Model;
}

function applyUpdateSet(target, $set) {
  for (const [path, value] of Object.entries($set)) {
    setPath(target, path, value);
  }
}

function setPath(obj, path, value) {
  const parts = String(path).split('.');
  let cursor = obj;
  while (parts.length > 1) {
    const key = parts.shift();
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[0]] = value;
}

function unsetPath(obj, path) {
  const parts = String(path).split('.');
  let cursor = obj;
  while (parts.length > 1) {
    const key = parts.shift();
    if (!cursor[key] || typeof cursor[key] !== 'object') return;
    cursor = cursor[key];
  }
  delete cursor[parts[0]];
}

function firebaseProjectId(env = process.env) {
  return String(env.FIREBASE_PROJECT_ID || '').trim() || undefined;
}

function firestoreDatabaseId(env = process.env) {
  const id = String(env.FIRESTORE_DATABASE_ID || '').trim();
  if (!id || id === '(default)') return undefined;
  return id;
}

function parseServiceAccount(raw = process.env.FIREBASE_SERVICE_ACCOUNT) {
  if (raw == null || raw === '') return null;
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.private_key || !parsed.client_email) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT must be a JSON service-account key with client_email and private_key.');
  }
  parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
  return parsed;
}

function hasFirebaseCredentials() {
  if (process.env.FUNCTION_TARGET || process.env.K_SERVICE || process.env.FIREBASE_CONFIG) {
    return true;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) return true;
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) return true;
  return false;
}

function shouldUseMemory() {
  if (process.env.FIRESTORE_IN_MEMORY === '1' || process.env.FIRESTORE_IN_MEMORY === 'true') {
    return true;
  }
  if (process.env.FIRESTORE_IN_MEMORY === '0' || process.env.FIRESTORE_IN_MEMORY === 'false') {
    return false;
  }
  return !hasFirebaseCredentials();
}

async function connectDB() {
  if (shouldUseMemory()) {
    useMemoryAdapter();
    console.log('[Firestore] Using in-memory store (set FIREBASE_PROJECT_ID / service account for production)');
    return { kind: 'memory' };
  }

  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const projectId = firebaseProjectId();
    const serviceAccount = parseServiceAccount();
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId
      });
    } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
    } else {
      admin.initializeApp(projectId ? { projectId } : undefined);
    }
  }

  const { getFirestore } = require('firebase-admin/firestore');
  const databaseId = firestoreDatabaseId();
  const db = databaseId ? getFirestore(admin.app(), databaseId) : getFirestore(admin.app());
  db.settings({ ignoreUndefinedProperties: true });
  useFirestoreAdapter(db);
  console.log(`[Firestore] Connected${databaseId ? ` (database=${databaseId})` : ''}`);
  return { kind: 'firestore', databaseId: databaseId || '(default)' };
}

async function disconnectDB() {
  if (adapterKind() === 'memory') {
    resetMemoryStore();
    return;
  }
  try {
    const admin = require('firebase-admin');
    await Promise.all(admin.apps.map((app) => app.delete()));
  } catch {
    // ignore
  }
  useMemoryAdapter();
}

module.exports = {
  Schema,
  model,
  Types,
  ObjectId,
  connectDB,
  disconnectDB,
  resetMemoryStore,
  useMemoryAdapter,
  adapterKind,
  DuplicateKeyError,
  shouldUseMemory,
  hasFirebaseCredentials,
  firebaseProjectId,
  firestoreDatabaseId,
  parseServiceAccount
};
