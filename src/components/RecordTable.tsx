import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, IndentDecrease, IndentIncrease, Plus, Trash2, Lock } from 'lucide-react';
import type { CollectionName, Project, Rec } from '../domain/types';
import { SCHEMAS, type FieldDef } from '../domain/schemas';
import { buildTree, fmtDate, fmtMoney, type TreeRow } from '../domain/calc';
import { artifactForCollection } from '../domain/constants';
import { db, recs, userName } from '../data/store';
import { projectPermissions } from '../services/rules';
import { deleteRecord, moveRecord, saveRecord } from '../services/workflow';
import { Field, HealthBadge, Modal, confirmAsk, useAction, useMe, useStore, Empty } from './ui';
import { PeoplePicker, PersonNameInput } from './PeoplePicker';

export interface ExtraColumn {
  label: string;
  render: (r: Rec, tree?: TreeRow<Rec>) => ReactNode;
  className?: string;
  after?: string; // insert after this field key
}

interface Props {
  project: Project;
  collection: CollectionName;
  title?: ReactNode;
  fields?: string[];
  extraColumns?: ExtraColumn[];
  rowActions?: (r: Rec) => ReactNode;
  filter?: (r: Rec) => boolean;
  sort?: (a: Rec, b: Rec) => number;
  rowClass?: (r: Rec) => string;
  defaults?: Record<string, any>;
  toolbar?: ReactNode;
  addLabel?: string;
  allowAdd?: boolean;
  empty?: ReactNode;
}

function optionsFor(f: FieldDef): readonly string[] {
  if (f.optionsFrom) return db.config.masterData[f.optionsFrom];
  return f.options ?? [];
}

const reqLabel = (projectId: string) => {
  const tree = buildTree(recs('requirements', projectId));
  return new Map(tree.map((t) => [t.rec.id, `REQ-${t.wbs}`]));
};

export function displayValue(f: FieldDef, r: Rec): ReactNode {
  const v = r[f.key];
  switch (f.type) {
    case 'user':
      return userName(v) || '—';
    case 'team':
      return db.teams.find((t) => t.id === v)?.name ?? '—';
    case 'testCaseRef':
      return db.testCases.find((t) => t.id === v)?.ref ?? '—';
    case 'requirementRefs': {
      const labels = reqLabel(r.projectId);
      const refs = db.traces.filter((t) => t.testCaseId === r.id).map((t) => labels.get(t.requirementId)).filter(Boolean);
      return refs.length ? refs.join(', ') : <span className="pill warn">No trace</span>;
    }
    case 'health':
      return v ? <HealthBadge value={v} /> : '—';
    case 'checkbox':
      return v ? '✓' : '';
    case 'currency':
      return v == null || v === '' ? '—' : fmtMoney(Number(v));
    case 'percent':
      return v == null || v === '' ? '—' : `${v}%`;
    case 'date':
      return v ? fmtDate(v) : '—';
    case 'datetime':
      return v ? String(v).replace('T', ' ') : '—';
    case 'textarea':
      return <span className="clamp">{v || ''}</span>;
    default:
      return v === undefined || v === null || v === '' ? '—' : String(v);
  }
}

export function RecordTable(props: Props) {
  useStore();
  const me = useMe();
  const { project: p, collection: c } = props;
  const schema = SCHEMAS[c];
  const perms = projectPermissions(me, p);
  const canEdit = perms.collections[c];
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ rec?: Rec; parentId?: string } | null>(null);
  const { run } = useAction();

  const all = recs(c, p.id).filter((r) => !props.filter || props.filter(r));
  const rows: TreeRow<Rec>[] = schema.hierarchical
    ? buildTree(all)
    : [...all].sort(props.sort ?? ((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt))).map((rec) => ({ rec, depth: 0, wbs: '', hasChildren: false }));
  const needle = q.trim().toLowerCase();
  const people = schema.fields.filter((f) => f.type === 'user').map((f) => f.key);
  const matches = (r: Rec) => Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(needle)) || people.some((k) => userName(r[k]).toLowerCase().includes(needle));
  const shown = needle ? rows.filter((t) => matches(t.rec)) : rows;
  const fields = (props.fields ? props.fields.map((k) => schema.fields.find((f) => f.key === k)!).filter(Boolean) : schema.fields.filter((f) => f.table));

  const inlineSave = (r: Rec, key: string, value: unknown) => run(() => saveRecord(p, c, r.id, { [key]: value }));

  const cells = (t: TreeRow<Rec>) => {
    const out: ReactNode[] = [];
    fields.forEach((f, i) => {
      const r = t.rec;
      let content: ReactNode;
      if (i === 0 && schema.hierarchical) {
        content = (
          <div className="tree-cell" style={{ paddingLeft: t.depth * 18 }}>
            <span className="wbs">{t.wbs}</span>
            <span style={{ fontWeight: t.hasChildren ? 600 : 400 }}>{r[f.key]}</span>
          </div>
        );
      } else if (f.inline && canEdit && !f.readOnly && (f.type === 'select' || f.type === 'health')) {
        content = (
          <select className="cell" value={r[f.key] ?? ''} onClick={(e) => e.stopPropagation()} onChange={(e) => inlineSave(r, f.key, e.target.value)} aria-label={f.label}>
            {optionsFor(f).map((o) => <option key={o} value={o}>{o || '—'}</option>)}
          </select>
        );
      } else if (f.inline && canEdit && f.type === 'checkbox') {
        content = <input type="checkbox" checked={!!r[f.key]} onClick={(e) => e.stopPropagation()} onChange={(e) => inlineSave(r, f.key, e.target.checked)} aria-label={f.label} />;
      } else if (f.inline && canEdit && ['number', 'currency'].includes(f.type) && !t.hasChildren) {
        content = <input className="cell num" style={{ width: 90 }} defaultValue={r[f.key] ?? ''} onClick={(e) => e.stopPropagation()} onBlur={(e) => String(r[f.key] ?? '') !== e.target.value && inlineSave(r, f.key, e.target.value)} aria-label={f.label} />;
      } else content = displayValue(f, r);
      out.push(<td key={f.key} className={['number', 'currency', 'percent'].includes(f.type) ? 'num' : ''} style={{ minWidth: f.width }}>{content}</td>);
      props.extraColumns?.filter((x) => x.after === f.key).forEach((x) => out.push(<td key={`${f.key}-x-${x.label}`} className={x.className}>{x.render(r, t)}</td>));
    });
    props.extraColumns?.filter((x) => !x.after).forEach((x) => out.push(<td key={`x-${x.label}`} className={x.className}>{x.render(t.rec, t)}</td>));
    return out;
  };

  const headers: ReactNode[] = [];
  fields.forEach((f) => {
    headers.push(<th key={f.key} className={['number', 'currency', 'percent'].includes(f.type) ? 'num' : ''}>{f.label}</th>);
    props.extraColumns?.filter((x) => x.after === f.key).forEach((x) => headers.push(<th key={`${f.key}-x-${x.label}`} className={x.className}>{x.label}</th>));
  });
  props.extraColumns?.filter((x) => !x.after).forEach((x) => headers.push(<th key={`x-${x.label}`} className={x.className}>{x.label}</th>));

  const art = artifactForCollection(c);
  return (
    <section className="card">
      <div className="card-head">
        <h3>{props.title ?? schema.label}</h3>
        <span className="meta">{art.code} · {all.length} row{all.length === 1 ? '' : 's'}</span>
        <div className="actions">
          {!canEdit && <span className="pill" title="You have read-only access to this artifact"><Lock size={12} /> Read-only</span>}
          {canEdit && props.allowAdd !== false && (
            <button className="btn primary sm" onClick={() => setEditing({ rec: undefined })}><Plus size={14} /> {props.addLabel ?? `Add ${schema.singular.toLowerCase()}`}</button>
          )}
        </div>
      </div>
      <div className="toolbar">
        <input type="search" placeholder={`Filter ${schema.label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        {props.toolbar}
      </div>
      {shown.length === 0 ? (
        <Empty>{props.empty ?? `No ${schema.label.toLowerCase()} yet.`}</Empty>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 640 }}>
          <table className="t">
            <thead>
              <tr>
                {headers}
                {(canEdit || props.rowActions) && <th className="right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.rec.id} className={`click ${t.rec.taskType === 'Phase' ? 'phase' : ''} ${props.rowClass?.(t.rec) ?? ''}`} onClick={() => setEditing({ rec: t.rec })}>
                  {cells(t)}
                  {(canEdit || props.rowActions) && (
                    <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                        {props.rowActions?.(t.rec)}
                        {canEdit && schema.hierarchical && (
                          <>
                            <button className="icon-btn" title="Add child row" onClick={() => setEditing({ parentId: t.rec.id })}><Plus size={14} /></button>
                            <button className="icon-btn" title="Move up" onClick={() => run(() => moveRecord(p, c, t.rec, 'up'))}><ArrowUp size={14} /></button>
                            <button className="icon-btn" title="Move down" onClick={() => run(() => moveRecord(p, c, t.rec, 'down'))}><ArrowDown size={14} /></button>
                            <button className="icon-btn" title="Indent" onClick={() => run(() => moveRecord(p, c, t.rec, 'indent'))}><IndentIncrease size={14} /></button>
                            <button className="icon-btn" title="Outdent" onClick={() => run(() => moveRecord(p, c, t.rec, 'outdent'))}><IndentDecrease size={14} /></button>
                          </>
                        )}
                        {canEdit && (
                          <button className="icon-btn" title="Delete" onClick={async () => (await confirmAsk('Delete row', `Delete "${t.rec[fields[0].key] ?? schema.singular}"${t.hasChildren ? ' and its child rows' : ''}? The deletion is recorded in the audit history.`, 'Delete', true)) && run(() => deleteRecord(p, c, t.rec), 'Deleted')}><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <RecordForm project={p} collection={c} rec={editing.rec} parentId={editing.parentId} defaults={props.defaults} readOnly={!canEdit} onClose={() => setEditing(null)} />}
    </section>
  );
}

export function RecordForm({ project: p, collection: c, rec, parentId, defaults, readOnly, onClose }: { project: Project; collection: CollectionName; rec?: Rec; parentId?: string; defaults?: Record<string, any>; readOnly?: boolean; onClose: () => void }) {
  const schema = SCHEMAS[c];
  const initial = useMemo(() => {
    const base: Record<string, any> = {};
    for (const f of schema.fields) base[f.key] = rec ? rec[f.key] : f.default ?? (f.type === 'checkbox' ? false : '');
    if (c === 'testCases') base.requirementIds = rec ? db.traces.filter((t) => t.testCaseId === rec.id).map((t) => t.requirementId) : [];
    if (schema.hierarchical) base.parentId = rec ? rec.parentId ?? '' : parentId ?? '';
    return { ...base, ...(rec ? {} : defaults) };
  }, [rec, parentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [v, setV] = useState<Record<string, any>>(initial);
  const { run, busy } = useAction();
  const set = (k: string, val: unknown) => setV((x) => ({ ...x, [k]: val }));
  const missing = schema.fields.filter((f) => f.required && !f.readOnly && (v[f.key] === '' || v[f.key] == null));

  const save = async () => {
    const data = { ...v };
    if (schema.hierarchical) data.parentId = v.parentId || null;
    const ok = await run(() => saveRecord(p, c, rec?.id ?? null, data), rec ? 'Saved' : `${schema.singular} added`);
    if (ok) onClose();
  };

  const tree = schema.hierarchical ? buildTree(recs(c, p.id)) : [];
  const descendants = new Set<string>();
  if (rec) {
    const walk = (id: string) => recs(c, p.id).filter((r) => r.parentId === id).forEach((r) => (descendants.add(r.id), walk(r.id)));
    walk(rec.id);
  }

  const input = (f: FieldDef) => {
    const dis = readOnly || f.readOnly;
    const val = v[f.key];
    switch (f.type) {
      case 'textarea':
        return <textarea disabled={dis} value={val ?? ''} onChange={(e) => set(f.key, e.target.value)} />;
      case 'select':
      case 'health':
        return (
          <select disabled={dis} value={val ?? ''} onChange={(e) => set(f.key, e.target.value)}>
            {!f.required && <option value="">—</option>}
            {f.required && !val && <option value="">Select…</option>}
            {optionsFor(f).filter((o) => o !== '' || !f.required).map((o) => <option key={o} value={o}>{o || '—'}</option>)}
          </select>
        );
      case 'checkbox':
        return <label className="check"><input type="checkbox" disabled={dis} checked={!!val} onChange={(e) => set(f.key, e.target.checked)} /> {f.label}</label>;
      case 'user':
        return <PeoplePicker value={val} disabled={dis} allowEmpty={!f.required} ariaLabel={f.label} onChange={(id) => set(f.key, id)} />;
      case 'team':
        return (
          <select disabled={dis} value={val ?? ''} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">Select team…</option>
            {db.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        );
      case 'testCaseRef':
        return (
          <select disabled={dis} value={val ?? ''} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">—</option>
            {recs('testCases', p.id).map((t) => <option key={t.id} value={t.id}>{t.ref} – {t.title}</option>)}
          </select>
        );
      case 'requirementRefs': {
        const reqs = buildTree(recs('requirements', p.id));
        const sel: string[] = val || [];
        return reqs.length ? (
          <div className="multi">
            {reqs.map((t) => (
              <label key={t.rec.id} title={t.rec.title}>
                <input type="checkbox" disabled={dis} checked={sel.includes(t.rec.id)} onChange={(e) => set(f.key, e.target.checked ? [...sel, t.rec.id] : sel.filter((x) => x !== t.rec.id))} />
                REQ-{t.wbs} {t.rec.title.slice(0, 40)}
              </label>
            ))}
          </div>
        ) : <span className="muted small">No BRD requirements yet.</span>;
      }
      case 'date':
        return <input type="date" disabled={dis} value={val ?? ''} onChange={(e) => set(f.key, e.target.value)} />;
      case 'datetime':
        return <input type="datetime-local" disabled={dis} value={val ?? ''} onChange={(e) => set(f.key, e.target.value)} />;
      case 'number':
      case 'currency':
      case 'percent':
        return <input type="number" disabled={dis} value={val ?? ''} min={f.type === 'percent' ? 0 : undefined} max={f.type === 'percent' ? 100 : undefined} step={f.type === 'currency' ? '0.01' : 'any'} onChange={(e) => set(f.key, e.target.value)} />;
      default:
        if (f.person) {
          const emailKey = f.person.emailKey;
          return <PersonNameInput value={val ?? ''} disabled={dis} ariaLabel={f.label} onChange={(name) => set(f.key, name)} onPick={(person) => setV((x) => ({ ...x, [f.key]: person.name, [emailKey]: person.email }))} onUnpick={() => set(emailKey, '')} />;
        }
        return <input disabled={dis} value={val ?? ''} onChange={(e) => set(f.key, e.target.value)} />;
    }
  };

  return (
    <Modal
      title={rec ? `${readOnly ? '' : 'Edit '}${schema.singular}` : `New ${schema.singular.toLowerCase()}`}
      onClose={onClose}
      footer={
        readOnly ? <button className="btn" onClick={onClose}>Close</button> : (
          <>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={busy || missing.length > 0} onClick={save} title={missing.length ? `Required: ${missing.map((f) => f.label).join(', ')}` : undefined}>{busy ? 'Saving…' : 'Save'}</button>
          </>
        )
      }
    >
      <div className="form-grid">
        {schema.hierarchical && (
          <Field label="Parent" full>
            <select disabled={readOnly} value={v.parentId ?? ''} onChange={(e) => set('parentId', e.target.value)}>
              <option value="">(top level)</option>
              {tree.filter((t) => t.rec.id !== rec?.id && !descendants.has(t.rec.id)).map((t) => (
                <option key={t.rec.id} value={t.rec.id}>{'  '.repeat(t.depth)}{t.wbs} {t.rec[schema.fields[0].key]}</option>
              ))}
            </select>
          </Field>
        )}
        {schema.fields.filter((f) => !(f.readOnly && !rec)).map((f) => (
          <Field key={f.key} label={f.type === 'checkbox' ? '' : f.label} required={f.required && !f.readOnly} help={f.help} full={f.type === 'textarea' || f.type === 'requirementRefs' || f.key === schema.fields[0].key}>
            {input(f)}
          </Field>
        ))}
      </div>
      {rec && <p className="small muted mt">Last updated {fmtDate(rec.updatedAt)} by {userName(rec.updatedBy) || '—'} · Change history is in the project's History tab.</p>}
    </Modal>
  );
}
