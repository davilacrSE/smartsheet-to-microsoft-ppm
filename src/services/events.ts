import type { Role, User } from '../domain/types';
import { db, insert, insertMany, me, nowIso, projectById } from '../data/store';
import { canSeeProject } from './rules';

export interface AuditInput {
  action: string;
  entity: string;
  entityId?: string;
  projectId?: string;
  artifact?: string;
  field?: string;
  before?: unknown;
  after?: unknown;
  details?: string;
}

const str = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : typeof v === 'string' ? v : JSON.stringify(v));

/** Business audit trail (AUD-FR-001..006). Rows are create-only; Dataverse auditing records platform changes too. */
export function audit(input: AuditInput, user: User = me()) {
  return insert('auditEvents', { ts: nowIso(), userId: user.id, userEmail: user.email, ...input, before: str(input.before), after: str(input.after) });
}

const IGNORED = new Set(['updatedAt', 'updatedBy', 'createdAt', 'createdBy', 'id', 'projectId']);

/** Field-level change history: one audit row per changed field (AUD-FR-002, BRD-FR-004). */
export async function auditChanges(base: Omit<AuditInput, 'field' | 'before' | 'after'>, before: Record<string, any>, changes: Record<string, any>) {
  const rows: Record<string, any>[] = [];
  const u = me();
  for (const k of Object.keys(changes)) {
    if (IGNORED.has(k)) continue;
    if (JSON.stringify(before[k] ?? null) === JSON.stringify(changes[k] ?? null)) continue;
    rows.push({ ts: nowIso(), userId: u.id, userEmail: u.email, ...base, field: k, before: str(before[k]), after: str(changes[k]) });
  }
  if (rows.length) await insertMany('auditEvents', rows);
}

export interface NotifyInput {
  projectId?: string;
  type: string;
  title: string;
  body: string;
  link?: string;
}

/**
 * In-app notification rows; a Power Automate flow on the notification table delivers the email / Teams channels
 * (NOT-FR-006). NOT-FR-007: recipients who cannot see the project are skipped, so NDA projects never leak.
 */
export async function notify(userIds: (string | undefined)[], n: NotifyInput) {
  const project = projectById(n.projectId);
  const rows: Record<string, any>[] = [];
  for (const id of new Set(userIds.filter(Boolean) as string[])) {
    const user = db.users.find((u) => u.id === id);
    if (!user || !user.active) continue;
    if (project && !canSeeProject(user, project)) continue;
    const channels = [user.notifyEmail ? 'email' : '', user.notifyTeams && !user.external ? 'teams' : ''].filter(Boolean);
    rows.push({ userId: id, projectId: n.projectId, type: n.type, title: n.title, body: n.body, link: n.link, channels, sentAt: nowIso(), read: false });
  }
  if (rows.length) await insertMany('notifications', rows);
}

export const usersWithRole = (...roles: Role[]) => db.users.filter((u) => u.active && roles.some((r) => u.roles.includes(r))).map((u) => u.id);

const logged = new Set<string>();
/** AUD-FR-006 / EXT-FR-008: log access to NDA projects and externally shared workspaces (once per session per view). */
export async function logAccess(projectId: string, what: string) {
  const p = projectById(projectId);
  const u = me();
  if (!p || !(p.ndaActive || u.external)) return;
  const key = `${projectId}:${what}`;
  if (logged.has(key)) return;
  logged.add(key);
  await audit({ action: 'ACCESS', entity: 'IT Project', entityId: projectId, projectId, artifact: what, details: `${u.external ? 'External' : 'NDA'} access: viewed ${what}` });
}
