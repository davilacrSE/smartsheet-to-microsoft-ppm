import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Save, Send } from 'lucide-react';
import type { Project } from '../domain/types';
import { db } from '../data/store';
import { hasRole, validateIntake } from '../services/rules';
import { addAttachment, createIntake, updateIntake, markReadyForReview } from '../services/workflow';
import { Card, Field, Notice, useAction, useMe, useStore } from '../components/ui';

type Draft = Partial<Project>;

/** PPM-FR-001/002: structured BRM intake form (also used to edit a Draft before submission). */
export function IntakeForm({ project, onDone }: { project?: Project; onDone?: (p: Project) => void }) {
  useStore();
  const me = useMe();
  const md = db.config.masterData;
  const [v, setV] = useState<Draft>(() => (project ? { ...project } : { agile: false, itgc: false, transformation: false }));
  const [files, setFiles] = useState<File[]>([]);
  const [touched, setTouched] = useState(false);
  const { run, busy } = useAction();
  const set = (k: keyof Project, val: unknown) => setV((x) => ({ ...x, [k]: val }));
  const errors = validateIntake({ ...v, brmId: me.id });

  const submit = async (ready: boolean) => {
    setTouched(true);
    if (ready && errors.length) return;
    const p = await run(async () => {
      let saved: Project;
      if (project) {
        await updateIntake(project, v);
        saved = project;
        if (ready) await markReadyForReview(project);
      } else saved = await createIntake(v, ready);
      for (const f of files) await addAttachment(saved, f);
      return saved;
    }, ready ? 'Submitted for PMO review — PMO Director and PMO Administrator notified' : 'Draft saved');
    if (p) onDone?.(p);
  };

  const sel = (k: keyof Project, opts: string[], label: string, required = true) => (
    <Field label={label} required={required}>
      <select value={(v[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)}>
        <option value="">Select…</option>
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    </Field>
  );

  return (
    <div className="stack">
      {touched && errors.length > 0 && <div className="errors" role="alert">{errors.join('\n')}</div>}
      <Card title="Project basics">
        <div className="form-grid">
          <Field label="Project name" required full><input value={v.name ?? ''} onChange={(e) => set('name', e.target.value)} maxLength={300} /></Field>
          <Field label="Main objective" required full><textarea value={v.mainObjective ?? ''} onChange={(e) => set('mainObjective', e.target.value)} /></Field>
          <Field label="Desired outcome / benefits case" required full><textarea value={v.desiredOutcome ?? ''} onChange={(e) => set('desiredOutcome', e.target.value)} /></Field>
          <Field label="BRM" help="Intake is submitted by Business Relationship Managers only (PPM-AS-001)."><input value={me.name} disabled /></Field>
          <Field label="Type of project" help="IT projects only; enhancements are managed separately."><input value="IT Project" disabled /></Field>
        </div>
      </Card>
      <Card title="Business case">
        <div className="form-grid">
          <Field label="Estimated cost (USD)" required><input type="number" min={0} value={v.estimatedCost ?? ''} onChange={(e) => set('estimatedCost', e.target.value)} /></Field>
          <Field label="Estimated benefit (USD)" required><input type="number" min={0} value={v.estimatedBenefit ?? ''} onChange={(e) => set('estimatedBenefit', e.target.value)} /></Field>
          {sel('benefitType', md.benefitTypes, 'Benefit type')}
          {sel('roadmapAlignment', md.roadmapOptions, 'IT roadmap alignment')}
        </div>
      </Card>
      <Card title="Alignment">
        <div className="form-grid">
          {sel('businessArea', md.businessAreas, 'Business area')}
          {sel('businessFunction', md.businessFunctions, 'Business function')}
          {sel('corporatePriority', md.corporatePriorities, 'Corporate priority')}
          {sel('pillar', md.pillars, 'Primary IT pillar')}
          {sel('program', md.programs, 'Program association', false)}
          <Field label="Flags">
            <div className="row" style={{ gap: 18, paddingTop: 6 }}>
              <label className="check"><input type="checkbox" checked={!!v.agile} onChange={(e) => set('agile', e.target.checked)} /> Agile delivery</label>
              <label className="check"><input type="checkbox" checked={!!v.itgc} onChange={(e) => set('itgc', e.target.checked)} /> ITGC-relevant</label>
              <label className="check"><input type="checkbox" checked={!!v.transformation} onChange={(e) => set('transformation', e.target.checked)} /> Transformation</label>
            </div>
          </Field>
          {v.itgc && <Field label="ITGC applications in scope" full><input value={v.itgcApplications ?? ''} onChange={(e) => set('itgcApplications', e.target.value)} placeholder="e.g. SAP S/4HANA, Workday" /></Field>}
        </div>
      </Card>
      <Card title="Planned dates" meta="Initiate must precede execution and go-live (PPM-FR-003)">
        <div className="form-grid">
          <Field label="Planned initiate date" required><input type="date" value={v.plannedInitiateDate ?? ''} onChange={(e) => set('plannedInitiateDate', e.target.value)} /></Field>
          <Field label="Planned execution date" required><input type="date" value={v.plannedExecuteDate ?? ''} onChange={(e) => set('plannedExecuteDate', e.target.value)} /></Field>
          <Field label="Planned go-live date" required><input type="date" value={v.plannedGoLiveDate ?? ''} onChange={(e) => set('plannedGoLiveDate', e.target.value)} /></Field>
          <Field label="Planned end date"><input type="date" value={v.plannedEndDate ?? ''} onChange={(e) => set('plannedEndDate', e.target.value)} /></Field>
        </div>
      </Card>
      <Card title="Supporting uploads" meta="Stored in Dataverse on the Intake Attachment table">
        <div className="row">
          <label className="btn"><Paperclip size={14} /> Add files<input type="file" multiple hidden onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])])} /></label>
          {files.map((f) => <span key={f.name} className="pill">{f.name} ({Math.ceil(f.size / 1024)} KB)</span>)}
          {project && db.attachments.filter((a) => a.projectId === project.id).map((a) => <span key={a.id} className="pill blue">{a.fileName}</span>)}
        </div>
      </Card>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <span className="small muted">Drafts can stay in Draft indefinitely until you mark them Ready for Review (PPM-FR-005).</span>
        <button className="btn" disabled={busy} onClick={() => submit(false)}><Save size={14} /> Save draft</button>
        <button className="btn primary" disabled={busy} onClick={() => submit(true)}><Send size={14} /> Save &amp; mark Ready for Review</button>
      </div>
    </div>
  );
}

export function Intake() {
  const me = useMe();
  const nav = useNavigate();
  if (!hasRole(me, 'BRM')) {
    return <Notice kind="warn">Only Business Relationship Managers can create IT project intake requests (SEC-FR-002).</Notice>;
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>New IT project intake</h1>
          <p className="sub">A unique Project ID and the Draft stage are assigned when you save (PPM-FR-004).</p>
        </div>
      </div>
      <IntakeForm onDone={(p) => nav(`/projects/${p.code}`)} />
    </>
  );
}
