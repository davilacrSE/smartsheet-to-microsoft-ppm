import type { AppConfig, CollectionName, DB, DirectoryPerson, EntityName, User } from '../domain/types';
import { DEFAULT_CONFIG } from '../domain/constants';
import { COLLECTIONS } from '../domain/schemas';

/** Persistence backend: Dataverse (production) or a browser-local mock (local preview / tests). */
export interface Backend {
  mode: 'mock' | 'dataverse';
  loadAll(): Promise<Partial<Record<EntityName, any[]>>>;
  create(entity: EntityName, rec: Record<string, any>): Promise<Record<string, any>>;
  update(entity: EntityName, id: string, changes: Record<string, any>): Promise<void>;
  remove(entity: EntityName, id: string): Promise<void>;
  signedInEmail(): Promise<string | undefined>;
  uploadFile(entity: EntityName, id: string, column: string, fileName: string, data: ArrayBuffer): Promise<void>;
  downloadFile(entity: EntityName, id: string, column: string): Promise<Uint8Array>;
  /** People in the organization directory whose name or email starts with `q`. */
  searchDirectory(q: string, top: number): Promise<DirectoryPerson[]>;
  reset?(): Promise<void>;
}

export const ENTITY_NAMES: EntityName[] = [
  'users', 'projects', 'gateReviews', 'exceptions', 'accessGrants', 'ndaAccess', 'notifications', 'auditEvents', 'settings', 'attachments',
  'teams', 'resources', 'assignments', 'scenarios', 'forecastEntries', 'actuals', 'traces', ...COLLECTIONS,
];

export const isCollection = (e: EntityName): e is CollectionName => (COLLECTIONS as string[]).includes(e);

export function emptyDb(): DB {
  const base = Object.fromEntries(ENTITY_NAMES.map((e) => [e, []])) as unknown as DB;
  base.config = structuredClone(DEFAULT_CONFIG);
  return base;
}

export let db: DB = emptyDb();
let backend: Backend | null = null;
let actingUserId = '';
let signedInUserId = '';
let version = 0;
const listeners = new Set<() => void>();

export const nowIso = () => new Date().toISOString();
export const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((Math.random() * 16) | (c === 'x' ? 0 : 8)).toString(16)));

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const getVersion = () => version;
export function bump() {
  version++;
  listeners.forEach((f) => f());
}

export const dataMode = () => backend?.mode ?? 'mock';

function parseConfig(): AppConfig {
  const row = db.settings[0];
  const stored = (row?.configJson ?? {}) as Partial<AppConfig> | string;
  const cfg = typeof stored === 'string' ? (JSON.parse(stored || '{}') as Partial<AppConfig>) : stored;
  return { ...structuredClone(DEFAULT_CONFIG), ...cfg, masterData: { ...DEFAULT_CONFIG.masterData, ...(cfg.masterData || {}) } };
}

export async function initStore(b: Backend): Promise<{ signedIn?: User; email?: string }> {
  backend = b;
  const data = await b.loadAll();
  db = { ...emptyDb(), ...data } as DB;
  db.config = parseConfig();
  const email = (await b.signedInEmail())?.toLowerCase();
  const signedIn = email ? db.users.find((u) => u.email.toLowerCase() === email && u.active) : undefined;
  signedInUserId = signedIn?.id ?? '';
  actingUserId = signedInUserId;
  bump();
  return { signedIn, email };
}

/** The signed-in Dataverse user's PPM profile (mock: the chosen persona). */
export const signedInUser = () => db.users.find((u) => u.id === signedInUserId);
/** The profile whose roles drive the UI and workflow rules (differs only when an admin tests as another persona). */
export function me(): User {
  const u = db.users.find((x) => x.id === actingUserId);
  if (!u) throw new Error('No signed-in PPM user');
  return u;
}
export const hasUser = () => !!db.users.find((x) => x.id === actingUserId);

export function setActingUser(id: string) {
  actingUserId = id;
  if (backend?.mode === 'mock') signedInUserId = id;
  bump();
}

export function table<E extends EntityName>(e: E): DB[E] {
  return db[e];
}

export async function insert<T = any>(entity: EntityName, data: Record<string, any>): Promise<T> {
  if (!backend) throw new Error('Store not initialised');
  const ts = nowIso();
  const rec: Record<string, any> = { id: data.id || newId(), ...data };
  if (isCollection(entity)) {
    rec.createdAt ||= ts;
    rec.updatedAt = ts;
    rec.createdBy ||= actingUserId;
    rec.updatedBy = actingUserId;
  }
  const saved = await backend.create(entity, rec);
  const merged = { ...rec, ...saved };
  merged.createdAt ||= ts;
  merged.updatedAt ||= ts;
  (db[entity] as any[]).push(merged);
  if (entity === 'settings') db.config = parseConfig();
  bump();
  return merged as T;
}

/** Insert many rows with limited concurrency (rows must not depend on each other). */
export async function insertMany(entity: EntityName, rows: Record<string, any>[], concurrency = 6): Promise<any[]> {
  const out: any[] = new Array(rows.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
      while (i < rows.length) {
        const idx = i++;
        out[idx] = await insert(entity, rows[idx]);
      }
    }),
  );
  return out;
}

export async function patch<T = any>(entity: EntityName, id: string, changes: Record<string, any>): Promise<T> {
  if (!backend) throw new Error('Store not initialised');
  const row = (db[entity] as any[]).find((r) => r.id === id);
  if (!row) throw new Error(`${entity} ${id} not found`);
  const ch = { ...changes };
  if (isCollection(entity)) ch.updatedBy = actingUserId;
  await backend.update(entity, id, ch);
  Object.assign(row, ch, { updatedAt: nowIso() });
  if (entity === 'settings') db.config = parseConfig();
  bump();
  return row as T;
}

export async function remove(entity: EntityName, id: string): Promise<void> {
  if (!backend) throw new Error('Store not initialised');
  await backend.remove(entity, id);
  const list = db[entity] as any[];
  const idx = list.findIndex((r) => r.id === id);
  if (idx >= 0) list.splice(idx, 1);
  bump();
}

export async function uploadFile(entity: EntityName, id: string, column: string, fileName: string, data: ArrayBuffer) {
  if (!backend) throw new Error('Store not initialised');
  await backend.uploadFile(entity, id, column, fileName, data);
}

export async function downloadFile(entity: EntityName, id: string, column: string) {
  if (!backend) throw new Error('Store not initialised');
  return backend.downloadFile(entity, id, column);
}

export async function searchDirectory(q: string, top = 15): Promise<DirectoryPerson[]> {
  if (!backend || !q.trim()) return [];
  return backend.searchDirectory(q.trim(), top);
}

export async function resetBackend() {
  await backend?.reset?.();
}

export const userById = (id?: string) => (id ? db.users.find((u) => u.id === id) : undefined);
export const userName = (id?: string) => userById(id)?.name ?? '';
export const projectById = (id?: string) => (id ? db.projects.find((p) => p.id === id) : undefined);
export const projectByCode = (code?: string) => (code ? db.projects.find((p) => p.code === code) : undefined);
export const recs = (c: CollectionName, projectId: string) => db[c].filter((r) => r.projectId === projectId);
