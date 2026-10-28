import type { EntityName } from '../domain/types';
import { DEFAULT_CONFIG } from '../domain/constants';
import type { Backend } from './store';
import { ENTITY_NAMES, newId } from './store';
import { buildSeed } from './seed';

import { PERSONA_KEY, rememberPersona } from './persona';
import { BRAND } from '../brand';

// One stored dataset per brand domain, so a demo opened with ?company=… gets its own sample people.
const KEY_PREFIX = 'ppm-demo-v3:';
const KEY = KEY_PREFIX + BRAND.emailDomain;

/** Keeps browser storage small: only the current brand's demo dataset is kept. */
function dropOtherDemoData() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return;
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (k && k !== KEY && k.startsWith(KEY_PREFIX)) ls.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/** Demo deep link: ?as=priya.natarajan opens the app as that sample persona. */
function personaFromUrl(): string | undefined {
  try {
    return new URLSearchParams(globalThis.location?.search || '').get('as')?.trim().toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}
type Tables = Partial<Record<EntityName, any[]>>;

function readStorage(): Tables | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Browser-local backend used for `npm run dev` previews and automated tests.
 * Mirrors Dataverse behaviour that matters to the app: server-assigned Project IDs (autonumber) and timestamps.
 */
export class MockBackend implements Backend {
  mode = 'mock' as const;
  private tables: Tables = {};
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private persist = true) {}

  private save() {
    if (!this.persist || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        globalThis.localStorage?.setItem(KEY, JSON.stringify(this.tables));
      } catch {
        /* storage full or unavailable: data stays in memory for this session */
      }
    }, 100);
  }

  async loadAll() {
    const stored = this.persist ? readStorage() : null;
    if (stored) this.tables = stored;
    else {
      if (this.persist) dropOtherDemoData();
      const seed = buildSeed(new Date());
      this.tables = { ...seed, settings: [{ id: newId(), name: 'Default', configJson: DEFAULT_CONFIG }] } as Tables;
      this.save();
    }
    for (const e of ENTITY_NAMES) this.tables[e] ||= [];
    return structuredClone(this.tables);
  }

  async create(entity: EntityName, rec: Record<string, any>) {
    const row = structuredClone(rec);
    const ts = new Date().toISOString();
    row.createdAt ||= ts;
    row.updatedAt = ts;
    if (entity === 'projects' && !row.code) {
      // Dataverse autonumber: ITProj-{yy}-{SEQNUM:3}
      const yy = String(new Date().getFullYear()).slice(2);
      const max = Math.max(0, ...(this.tables.projects || []).map((p) => Number(String(p.code).split('-').pop()) || 0));
      row.code = `ITProj-${yy}-${String(max + 1).padStart(3, '0')}`;
    }
    this.tables[entity]!.push(row);
    this.save();
    return { id: row.id, code: row.code, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  async update(entity: EntityName, id: string, changes: Record<string, any>) {
    const row = this.tables[entity]!.find((r) => r.id === id);
    if (!row) throw new Error(`${entity} ${id} not found`);
    Object.assign(row, structuredClone(changes), { updatedAt: new Date().toISOString() });
    this.save();
  }

  async remove(entity: EntityName, id: string) {
    const list = this.tables[entity]!;
    const i = list.findIndex((r) => r.id === id);
    if (i >= 0) list.splice(i, 1);
    this.save();
  }

  async uploadFile(entity: EntityName, id: string, column: string, fileName: string, data: ArrayBuffer) {
    const row = this.tables[entity]!.find((r) => r.id === id);
    if (!row) throw new Error(`${entity} ${id} not found`);
    let bin = '';
    new Uint8Array(data).forEach((b) => (bin += String.fromCharCode(b)));
    row[`${column}__data`] = btoa(bin);
    row[`${column}__name`] = fileName;
    this.save();
  }

  async downloadFile(entity: EntityName, id: string, column: string) {
    const row = this.tables[entity]!.find((r) => r.id === id);
    const b64 = row?.[`${column}__data`];
    if (!b64) throw new Error('File not found');
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }

  async signedInEmail() {
    const as = personaFromUrl();
    const linked = as ? (this.tables.users || []).find((x) => x.email.split('@')[0] === as || x.email === as) : undefined;
    if (linked) {
      rememberPersona(linked.id);
      try {
        // Drop ?as= so a later persona switch in the menu sticks across reloads.
        const url = new URL(globalThis.location.href);
        url.searchParams.delete('as');
        globalThis.history?.replaceState(null, '', url.toString());
      } catch {
        /* ignore */
      }
      return linked.email;
    }
    let id: string | null = null;
    try {
      id = globalThis.localStorage?.getItem(PERSONA_KEY) ?? null;
    } catch {
      /* ignore */
    }
    const users = this.tables.users || [];
    const u = users.find((x) => x.id === id) || users.find((x) => x.roles?.includes('PMO_DIRECTOR'));
    return u?.email;
  }

  /** Stand-in for the organization directory: the sample profiles plus the sample resources. */
  async searchDirectory(q: string, top: number) {
    const needle = q.toLowerCase();
    const people = new Map<string, { name: string; email: string; title?: string; guest: boolean }>();
    for (const u of this.tables.users || []) people.set(u.email.toLowerCase(), { name: u.name, email: u.email.toLowerCase(), title: u.title, guest: !!u.external });
    for (const r of this.tables.resources || []) if (r.email && !people.has(r.email.toLowerCase())) people.set(r.email.toLowerCase(), { name: r.name, email: r.email.toLowerCase(), title: r.specialty, guest: r.resourceType !== 'Internal' });
    return [...people.values()]
      .filter((p) => [p.name, ...p.name.split(/\s+/), p.email].some((s) => s.toLowerCase().startsWith(needle)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, top);
  }

  async reset() {
    try {
      globalThis.localStorage?.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}
