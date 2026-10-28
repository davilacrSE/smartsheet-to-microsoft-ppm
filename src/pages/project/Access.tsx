import { useState } from 'react';
import { Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { AccessGrant, ArtifactKey, Project } from '../../domain/types';
import { ARTIFACTS } from '../../domain/constants';
import { addDays, fmtDate, fmtDateTime, todayISO } from '../../domain/calc';
import { db, userName } from '../../data/store';
import { isAdmin, isPmo, ndaList, projectPermissions } from '../../services/rules';
import { addNdaMember, convertNda, designateNda, ensureProfile, internalDomain, recertifyNda, removeNdaMember, renewGrant, requestGrant, revokeGrant, setRestrictedArtifacts } from '../../services/workflow';
import { Card, Empty, Field, Modal, Notice, ask, useAction, useMe, useStore } from '../../components/ui';
import { PeoplePicker, PersonNameInput } from '../../components/PeoplePicker';
import { BRAND } from '../../brand';

const ARTIFACT_CHOICES = ARTIFACTS.filter((a) => a.key !== 'dashboard' && a.key !== 'metadata');

/** §17: confidential NDA workflow, artifact restrictions and time-bound external access. */
export function AccessTab({ p }: { p: Project }) {
  useStore();
  return (
    <div className="stack">
      <NdaSection p={p} />
      <Restrictions p={p} />
      <ExternalAccess p={p} />
    </div>
  );
}

function NdaSection({ p }: { p: Project }) {
  const me = useMe();
  const perm = projectPermissions(me, p);
  const { run, busy } = useAction();
  const [designating, setDesignating] = useState(false);
  const [converting, setConverting] = useState(false);
  const [adding, setAdding] = useState(false);

  if (!p.ndaActive && !p.ndaConverted) {
    return (
      <Card title="Confidential NDA workflow" meta="PMO Director only (SEC-FR-011)" actions={perm.ndaDesignate && <button className="btn sm" onClick={() => setDesignating(true)}><Lock size={14} /> Designate as NDA project</button>}>
        <p className="muted">Standard project — visible in portfolio views to all internal users. The PMO Director can move a BRM-submitted intake into the hidden parallel NDA workflow up to ACT approval.</p>
        {designating && <DesignateModal p={p} onClose={() => setDesignating(false)} />}
      </Card>
    );
  }
  if (p.ndaConverted && !p.ndaActive) {
    return (
      <Card title="Confidential NDA workflow" meta="Converted to the regular workflow">
        <dl className="dl">
          <dt>Converted</dt><dd>{fmtDateTime(p.ndaConvertedAt)} by {userName(p.ndaConvertedById)}</dd>
          <dt>Rationale</dt><dd>{p.ndaConversionRationale}</dd>
          <dt>Originally designated</dt><dd>{fmtDateTime(p.ndaDesignatedAt)} by {userName(p.ndaDesignatedById)} — {p.ndaRationale}</dd>
        </dl>
        <p className="small muted mt">All NDA history, approvals, artifacts and audit logs were preserved (NDA-FR-010).</p>
      </Card>
    );
  }
  const list = ndaList(p);
  return (
    <Card title={<><Lock size={16} style={{ verticalAlign: -2 }} /> Confidential NDA project{p.ndaCodename ? ` – ${p.ndaCodename}` : ''}</>} meta="Hidden from everyone not on the approved access list" actions={
      <>
        {perm.ndaManageAccess && <button className="btn sm" disabled={busy} onClick={() => run(() => recertifyNda(p), 'Access list recertified')}><ShieldCheck size={14} /> Recertify list</button>}
        {perm.ndaManageAccess && <button className="btn sm" onClick={() => setAdding(true)}><Plus size={14} /> Add person</button>}
        {perm.ndaConvert && <button className="btn primary sm" onClick={() => setConverting(true)}>Convert to regular workflow</button>}
      </>
    } flush>
      <div className="card-body">
        <dl className="dl">
          <dt>Designated</dt><dd>{fmtDateTime(p.ndaDesignatedAt)} by {userName(p.ndaDesignatedById)}</dd>
          <dt>Business rationale</dt><dd>{p.ndaRationale}</dd>
          <dt>Last access review</dt><dd>{fmtDate(p.ndaLastReviewedAt)}</dd>
        </dl>
        {!perm.ndaConvert && isPmo(me) && <p className="small muted mt">Conversion to the regular workflow is available to the PMO Director after ACT approval.</p>}
      </div>
      <table className="t">
        <thead><tr><th>Approved access list</th><th>Email</th><th>Type</th><th>Added</th><th>Recertified</th><th /></tr></thead>
        <tbody>
          {list.map((a) => {
            const u = db.users.find((x) => x.id === a.userId);
            return (
              <tr key={a.id}>
                <td>{u?.name}{a.designee && <span className="pill blue" style={{ marginLeft: 6 }}>Designee</span>}</td>
                <td>{u?.email}</td>
                <td>{u?.external || (u && !internalDomain(u.email)) ? <span className="pill warn">External / non-{BRAND.company}</span> : 'Internal'}</td>
                <td className="small">{fmtDate(a.addedAt)} by {userName(a.addedById)}</td>
                <td className="small">{fmtDate(a.lastRecertifiedAt)}</td>
                <td className="right">{perm.ndaManageAccess && <button className="icon-btn" aria-label="Remove" onClick={() => run(() => removeNdaMember(p, a.id), 'Removed from access list')}><Trash2 size={14} /></button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {adding && <AddNdaMemberModal p={p} onClose={() => setAdding(false)} />}
      {converting && <ConvertModal p={p} onClose={() => setConverting(false)} />}
    </Card>
  );
}

function DesignateModal({ p, onClose }: { p: Project; onClose: () => void }) {
  const [rationale, setRationale] = useState('');
  const [codename, setCodename] = useState('');
  const { run, busy } = useAction();
  return (
    <Modal title="Designate confidential NDA project" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !rationale.trim()} onClick={async () => { const ok = await run(() => designateNda(p, rationale, codename), 'Project moved to the confidential NDA workflow'); if (ok !== undefined) onClose(); }}>Designate</button></>}>
      <div className="stack">
        <Notice kind="warn">The project will disappear from dashboards, reports, search, notifications and recent items for everyone not on the approved access list. The BRM, PM and sponsor are added to the list automatically.</Notice>
        <Field label="Codename" help="Optional; shown instead of the real name in restricted views."><input value={codename} onChange={(e) => setCodename(e.target.value)} placeholder="e.g. Project Falcon" /></Field>
        <Field label="Documented business rationale" required help="NDA-FR-008 / GOV-FR-007"><textarea value={rationale} onChange={(e) => setRationale(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function AddNdaMemberModal({ p, onClose }: { p: Project; onClose: () => void }) {
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [designee, setDesignee] = useState(false);
  const { run, busy } = useAction();
  const save = async () => {
    const ok = await run(async () => {
      let id = userId;
      if (!id) {
        if (!email.includes('@') || !name.trim()) throw new Error('Pick a person or enter a name and email.');
        id = (await ensureProfile(email, name, !internalDomain(email))).id;
      }
      await addNdaMember(p, id, designee);
    }, 'Added to the approved access list');
    if (ok !== undefined) onClose();
  };
  return (
    <Modal title="Add to NDA access list" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Add</button></>}>
      <div className="form-grid">
        <Field label="Person" full help={`Search ${BRAND.appName} users and the organization directory.`}><PeoplePicker value={userId} includeExternal ariaLabel="Person" onChange={setUserId} /></Field>
        <div className="form-section">…or an external / non-{BRAND.company} person who is not in the directory (NDA-FR-007)</div>
        <Field label="Name"><input value={name} disabled={!!userId} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><input value={email} disabled={!!userId} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Designee" full><label className="check"><input type="checkbox" checked={designee} onChange={(e) => setDesignee(e.target.checked)} /> May maintain the access list on the PMO Director's behalf (NDA-FR-006)</label></Field>
      </div>
    </Modal>
  );
}

function ConvertModal({ p, onClose }: { p: Project; onClose: () => void }) {
  const [rationale, setRationale] = useState('');
  const [keep, setKeep] = useState<ArtifactKey[]>([]);
  const { run, busy } = useAction();
  return (
    <Modal title="Convert to the regular project workflow" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !rationale.trim()} onClick={async () => { const ok = await run(() => convertNda(p, rationale, keep), 'Converted to the regular workflow'); if (ok !== undefined) onClose(); }}>Convert</button></>}>
      <div className="stack">
        <p>After conversion the project becomes visible in standard portfolio views. All NDA history, approvals, artifacts, access records and audit logs are kept (NDA-FR-010).</p>
        <Field label="Conversion rationale" required><textarea value={rationale} onChange={(e) => setRationale(e.target.value)} /></Field>
        <Field label="Keep these artifacts restricted to the access list (NDA-FR-011)">
          <div className="multi">{ARTIFACT_CHOICES.map((a) => <label key={a.key}><input type="checkbox" checked={keep.includes(a.key)} onChange={(e) => setKeep(e.target.checked ? [...keep, a.key] : keep.filter((k) => k !== a.key))} />{a.code} {a.title}</label>)}</div>
        </Field>
      </div>
    </Modal>
  );
}

function Restrictions({ p }: { p: Project }) {
  const me = useMe();
  const perm = projectPermissions(me, p);
  const { run, busy } = useAction();
  const [keys, setKeys] = useState<ArtifactKey[]>(p.restrictedArtifacts);
  if (!perm.manageRestrictions && !p.restrictedArtifacts.length) return null;
  return (
    <Card title="Artifact restrictions" meta="ART-FR-005/007 – restricted artifacts are visible only to the PM, PMO Director and NDA access list" actions={perm.manageRestrictions && <button className="btn sm primary" disabled={busy || JSON.stringify(keys) === JSON.stringify(p.restrictedArtifacts)} onClick={() => run(() => setRestrictedArtifacts(p, keys), 'Restrictions saved')}>Save</button>}>
      <div className="multi">
        {ARTIFACT_CHOICES.map((a) => (
          <label key={a.key}><input type="checkbox" disabled={!perm.manageRestrictions} checked={keys.includes(a.key)} onChange={(e) => setKeys(e.target.checked ? [...keys, a.key] : keys.filter((k) => k !== a.key))} />{a.code} {a.title}</label>
        ))}
      </div>
    </Card>
  );
}

function ExternalAccess({ p }: { p: Project }) {
  const me = useMe();
  const perm = projectPermissions(me, p);
  const { run } = useAction();
  const [requesting, setRequesting] = useState(false);
  const grants = db.accessGrants.filter((g) => g.projectId === p.id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const canRevoke = isAdmin(me) || isPmo(me) || me.id === p.pmId || me.id === p.sponsorId;
  const tone = (g: AccessGrant) => (g.status === 'Active' ? 'good' : g.status.startsWith('Pending') ? 'warn' : g.status === 'Rejected' || g.status === 'Revoked' ? 'crit' : '');
  return (
    <Card title={`External & non-${BRAND.company} access`} meta="Sponsor/owner + administrator approval · expiry required · auto-revoked at expiry" actions={perm.requestExternalAccess && <button className="btn primary sm" onClick={() => setRequesting(true)}><Plus size={14} /> Request access</button>} flush>
      {grants.length === 0 ? <Empty>No external access for this project.</Empty> : (
        <table className="t">
          <thead><tr><th>Grantee</th><th>Scope</th><th>Permission</th><th>Expires</th><th>Status</th><th>Approvals</th><th /></tr></thead>
          <tbody>
            {grants.map((g) => (
              <tr key={g.id}>
                <td>{g.name}<div className="small muted">{g.email}</div></td>
                <td className="small">{g.scope === 'workspace' ? 'Whole workspace' : g.artifactKeys.map((k) => ARTIFACTS.find((a) => a.key === k)?.title).join(', ')}</td>
                <td>{g.permission}</td>
                <td className="nowrap">{fmtDate(g.expiresAt)}</td>
                <td><span className={`pill ${tone(g)}`}>{g.status}</span>{g.closeReason && <div className="small muted">{g.closeReason}</div>}</td>
                <td className="small">Requested by {userName(g.requestedById)}{g.sponsorApprovedById && <div>Sponsor/owner: {userName(g.sponsorApprovedById)}</div>}{g.adminApprovedById && <div>Admin: {userName(g.adminApprovedById)}</div>}</td>
                <td className="right nowrap">
                  {g.status === 'Active' && canRevoke && <button className="btn sm danger" onClick={async () => { const r = await ask({ title: 'Revoke access', label: 'Reason', required: true }); if (r) await run(() => revokeGrant(g, r), 'Access revoked'); }}>Revoke</button>}{' '}
                  {['Active', 'Expired'].includes(g.status) && perm.requestExternalAccess && <button className="btn sm" onClick={async () => { const j = await ask({ title: 'Renew access', label: 'Justification for renewal', required: true }); if (j) await run(() => renewGrant(g, addDays(todayISO(), 90), j), 'Renewal requested (90 days) – approvals required'); }}>Renew</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {requesting && <RequestGrantModal p={p} onClose={() => setRequesting(false)} />}
    </Card>
  );
}

function RequestGrantModal({ p, onClose }: { p: Project; onClose: () => void }) {
  const [v, setV] = useState({ email: '', name: '', scope: 'artifact' as 'workspace' | 'artifact', artifactKeys: [] as ArtifactKey[], permission: 'View' as 'View' | 'Edit', expiresAt: addDays(todayISO(), 60), justification: '' });
  const { run, busy } = useAction();
  return (
    <Modal title="Request external access" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={async () => { const ok = await run(() => requestGrant(p, v), 'Request sent to sponsor/owner for approval'); if (ok !== undefined) onClose(); }}>Submit request</button></>}>
      <div className="form-grid">
        <Field label="Name" required help="Pick a person, or type the name of someone outside the directory."><PersonNameInput value={v.name} ariaLabel="Grantee name" onChange={(name) => setV({ ...v, name })} onPick={(person) => setV({ ...v, name: person.name, email: person.email })} onUnpick={() => setV((x) => ({ ...x, email: '' }))} /></Field>
        <Field label="Email" required help={v.email.includes('@') ? (internalDomain(v.email) ? `${BRAND.company} address` : `Non-${BRAND.company} address`) : undefined}><input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label="Scope"><select value={v.scope} onChange={(e) => setV({ ...v, scope: e.target.value as 'workspace' | 'artifact' })}><option value="artifact">Specific artifacts</option><option value="workspace">Whole project workspace</option></select></Field>
        <Field label="Permission"><select value={v.permission} onChange={(e) => setV({ ...v, permission: e.target.value as 'View' | 'Edit' })}><option>View</option><option>Edit</option></select></Field>
        {v.scope === 'artifact' && (
          <Field label="Artifacts" required full>
            <div className="multi">{ARTIFACT_CHOICES.filter((a) => a.collection).map((a) => <label key={a.key}><input type="checkbox" checked={v.artifactKeys.includes(a.key)} onChange={(e) => setV({ ...v, artifactKeys: e.target.checked ? [...v.artifactKeys, a.key] : v.artifactKeys.filter((k) => k !== a.key) })} />{a.code} {a.title}</label>)}</div>
          </Field>
        )}
        <Field label="Expires on" required help="Required (EXT-FR-004); access is removed automatically when it lapses."><input type="date" value={v.expiresAt} onChange={(e) => setV({ ...v, expiresAt: e.target.value })} /></Field>
        <Field label="Justification" required full><textarea value={v.justification} onChange={(e) => setV({ ...v, justification: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
