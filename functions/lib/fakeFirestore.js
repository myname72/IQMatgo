// 테스트용 인메모리 Firestore (트랜잭션의 "읽기는 쓰기보다 먼저" 규칙까지 흉내 낸다)
const INC = (n) => ({ __inc: n });
const DEL = { __del: true };
export const FieldValue = { increment: INC, delete: () => DEL, serverTimestamp: () => ({ __ts: true }) };

function applyPatch(data, patch, isSet) {
  const out = isSet ? {} : { ...data };
  for (const [k, v] of Object.entries(patch)) {
    if (v && v.__del) delete out[k];
    else if (v && v.__inc !== undefined) out[k] = (data[k] ?? 0) + v.__inc;
    else if (v && v.__ts) out[k] = Date.now();
    else out[k] = v;
  }
  return out;
}

export function makeDb() {
  const store = new Map();
  let auto = 0;
  const snap = (path, id) => ({ id, exists: store.has(path), data: () => (store.has(path) ? structuredClone(store.get(path)) : undefined), ref: { path } });
  class Doc {
    constructor(path) { this.path = path; this.id = path.split('/').pop(); }
    collection(name) { return new Coll(`${this.path}/${name}`); }
  }
  class Query {
    constructor(path, filters = [], lim = Infinity) { this.path = path; this.filters = filters; this.lim = lim; }
    where(f, op, v) { return new Query(this.path, [...this.filters, [f, op, v]], this.lim); }
    limit(n) { return new Query(this.path, this.filters, n); }
    async get() { return this.run(); }
    run() {
      const docs = [];
      for (const [p, d] of store) {
        if (!p.startsWith(`${this.path}/`) || p.slice(this.path.length + 1).includes('/')) continue;
        if (this.filters.every(([f, , v]) => d[f] === v)) docs.push(snap(p, p.split('/').pop()));
        if (docs.length >= this.lim) break;
      }
      return { docs, empty: docs.length === 0 };
    }
  }
  class Coll extends Query {
    doc(id) { return new Doc(`${this.path}/${id ?? `auto${++auto}`}`); }
  }
  const db = {
    collection: (name) => new Coll(name),
    async runTransaction(fn) {
      const writes = [];
      let wrote = false;
      const tx = {
        async get(x) {
          if (wrote) throw new Error('트랜잭션: 쓰기 뒤에 읽을 수 없습니다');
          return x instanceof Doc ? snap(x.path, x.id) : x.run();
        },
        set(ref, data) { wrote = true; writes.push(() => store.set(ref.path, applyPatch({}, data, true))); },
        update(ref, patch) {
          wrote = true;
          writes.push(() => {
            if (!store.has(ref.path)) throw new Error(`없는 문서를 update: ${ref.path}`);
            store.set(ref.path, applyPatch(store.get(ref.path), patch, false));
          });
        },
        delete(ref) { wrote = true; writes.push(() => store.delete(ref.path)); },
      };
      const result = await fn(tx);
      writes.forEach((w) => w());
      return result;
    },
  };
  return { db, store };
}
