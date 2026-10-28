import { useEffect, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, CheckCircle2, PauseCircle, PlayCircle, Undo2, XCircle } from 'lucide-react';
import type { ArtifactKey, Project } from '../../domain/types';
import { STAGES, STAGE_DESCRIPTIONS, stageIndex } from '../../domain/constants';
import { fmtDate } from '../../domain/calc';
import { projectByCode, userName } from '../../data/store';
import { canSeeArtifact, canSeeProject, projectPermissions } from '../../services/rules';
import { statusAction } from '../../services/workflow';
import { logAccess } from '../../services/events';
import { rememberRecent } from '../../components/Layout';
import { HealthBadge, NdaBadge, Notice, StatusPill, ask, useAction, useMe, useStore } from '../../components/ui';
import { Overview } from './Overview';
import { Governance } from './Governance';
import { AccessTab } from './Access';
import { CutoverTab, FinancialsTab, HistoryTab, PeopleTab, PlanTab, RaiddTab, RequirementsTab, ResourcesTab, StatusTab, TestingTab } from './ArtifactTabs';

interface TabDef {
  key: string;
  label: string;
  artifacts?: ArtifactKey[];
  minStage?: number;
  render: (p: Project) => ReactNode;
}

const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', render: (p) => <Overview p={p} /> },
  { key: 'governance', label: 'Governance', render: (p) => <Governance p={p} /> },
  { key: 'requirements', label: 'BRD', artifacts: ['brd'], minStage: 1, render: (p) => <RequirementsTab p={p} /> },
  { key: 'plan', label: 'Plan', artifacts: ['plan'], minStage: 1, render: (p) => <PlanTab p={p} /> },
  { key: 'raidd', label: 'RAIDD', artifacts: ['raidd'], minStage: 1, render: (p) => <RaiddTab p={p} /> },
  { key: 'status', label: 'Status', artifacts: ['status'], minStage: 1, render: (p) => <StatusTab p={p} /> },
  { key: 'financials', label: 'Financials', artifacts: ['budget', 'costEstimator'], minStage: 1, render: (p) => <FinancialsTab p={p} /> },
  { key: 'resources', label: 'Resources', artifacts: ['resourceEstimator'], minStage: 1, render: (p) => <ResourcesTab p={p} /> },
  { key: 'testing', label: 'Testing', artifacts: ['uatPlan', 'uatDefects'], minStage: 1, render: (p) => <TestingTab p={p} /> },
  { key: 'cutover', label: 'Cutover & Hypercare', artifacts: ['cutover', 'hypercare'], minStage: 1, render: (p) => <CutoverTab p={p} /> },
  { key: 'people', label: 'Stakeholders & RACI', artifacts: ['stakeholders', 'raci'], minStage: 1, render: (p) => <PeopleTab p={p} /> },
  { key: 'access', label: 'Access', render: (p) => <AccessTab p={p} /> },
  { key: 'history', label: 'History', render: (p) => <HistoryTab p={p} /> },
];

export function Workspace() {
  useStore();
  const me = useMe();
  const nav = useNavigate();
  const { code, tab = 'overview' } = useParams();
  const p = projectByCode(code);
  const visible = !!p && canSeeProject(me, p);
  const tabs = visible ? TABS.filter((t) => (!t.minStage || stageIndex(p!.stage) >= t.minStage || p!.status !== 'Active') && (!t.artifacts || t.artifacts.some((a) => canSeeArtifact(me, p!, a))) && !(me.external && ['governance', 'access', 'history'].includes(t.key))) : [];
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];

  useEffect(() => {
    if (!visible || !p) return;
    rememberRecent(p.code);
    void logAccess(p.id, current?.label ?? 'Overview');
  }, [p?.id, current?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // RPT-FR-007 / AC-016: unauthorized users get no indication that an NDA project exists.
  if (!visible || !p) return <Notice kind="warn">Project “{code}” was not found, or you do not have access to it.</Notice>;

  return (
    <>
      <ProjectHeader p={p} />
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <Link key={t.key} to={`/projects/${p.code}/${t.key}`} className={t.key === current.key ? 'active' : ''} role="tab" aria-selected={t.key === current.key}>{t.label}</Link>
        ))}
      </div>
      {current.render(p)}
      {p.stage === 'Draft' && tab !== 'overview' && tab !== 'governance' && tab !== 'access' && tab !== 'history' && <div className="small muted mt">Artifacts are created when Stage Gate 0 approves the intake. <button className="btn sm" onClick={() => nav(`/projects/${p.code}`)}>Back to intake</button></div>}
    </>
  );
}

function ProjectHeader({ p }: { p: Project }) {
  const me = useMe();
  const perm = projectPermissions(me, p);
  const { run, busy } = useAction();
  const si = stageIndex(p.stage);
  const act = async (action: Parameters<typeof statusAction>[1], title: string, label: string) => {
    const reason = await ask({ title, label, required: true });
    if (reason) await run(() => statusAction(p, action, reason), `${title} recorded`);
  };
  return (
    <div className="proj-head">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="row"><span className="code">{p.code}</span><NdaBadge p={p} />{p.itgc && <span className="pill blue">ITGC</span>}<span className="pill">{p.agile ? 'Agile' : 'Waterfall'}</span>{p.demo && <span className="pill">Sample data</span>}</div>
          <h1 style={{ marginTop: 4 }}>{p.ndaActive && p.ndaCodename ? `${p.ndaCodename} – ${p.name}` : p.name}</h1>
          <div className="row small muted" style={{ marginTop: 6 }}>
            <span>{p.businessArea} · {p.businessFunction} · {p.pillar}</span>
            <span>BRM <b>{userName(p.brmId) || '—'}</b></span>
            <span>PM <b>{userName(p.pmId) || '—'}</b></span>
            <span>Sponsor <b>{userName(p.sponsorId) || '—'}</b></span>
            <span>Go-live {fmtDate(p.plannedGoLiveDate)}</span>
          </div>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end', gap: 8 }}>
          <div className="row"><StatusPill status={p.status} /><HealthBadge value={p.healthOverall} label={p.healthOverall ? `Overall ${p.healthOverall}` : undefined} /></div>
          <div className="row">
            {perm.hold && <button className="btn sm" disabled={busy} onClick={() => act('hold', 'Put on hold', 'Reason')}><PauseCircle size={14} /> Hold</button>}
            {perm.resume && <button className="btn sm" disabled={busy} onClick={() => act('resume', 'Resume project', 'Reason')}><PlayCircle size={14} /> Resume</button>}
            {perm.withdraw && <button className="btn sm" disabled={busy} onClick={() => act('withdraw', 'Withdraw project', 'Reason for withdrawal')}><XCircle size={14} /> Withdraw</button>}
            {perm.closeComplete && <button className="btn sm" disabled={busy} onClick={() => act('closeComplete', 'Mark closed complete', 'Closure summary')}><CheckCircle2 size={14} /> Closed complete</button>}
            {perm.archive && <button className="btn sm" disabled={busy} onClick={() => act('archive', 'Archive project', 'Archive reason (manual archive only – PPM-FR-031)')}><Archive size={14} /> Archive</button>}
            {p.status !== 'Active' && p.status !== 'On Hold' && p.stage !== 'Archive' && !perm.archive && <span className="small muted"><Undo2 size={12} /> Awaiting manual archive</span>}
          </div>
        </div>
      </div>
      <div className="stepper" aria-label="Lifecycle stage">
        {STAGES.map((s, i) => (
          <div key={s} className={`step ${i < si ? 'done' : i === si ? 'current' : ''}`} title={STAGE_DESCRIPTIONS[s]}>{s}</div>
        ))}
      </div>
    </div>
  );
}
