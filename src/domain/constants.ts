import type { ArtifactKey, CollectionName, GateKey, Role, Stage, TransitionKey, ProjectStatus, AppConfig } from './types';
import { BRAND, TABLE_PREFIX } from '../brand';

export const STAGES: Stage[] = [
  'Draft',
  'Initiate',
  'Plan',
  'ACT Readiness',
  'ACT Approved / Execute Ready',
  'Execute',
  'Go-Live / Hypercare',
  'Close',
  'Archive',
];

export const STAGE_DESCRIPTIONS: Record<Stage, string> = {
  Draft: 'BRM-entered intake request not yet approved to initiate.',
  Initiate: 'Approved through Stage Gate 0; initial artifacts generated.',
  Plan: 'Approved through Stage Gate 1; detailed planning underway.',
  'ACT Readiness': 'Reviewed for readiness to proceed through ACT/funding approval.',
  'ACT Approved / Execute Ready': 'ACT approval obtained and project ready to execute.',
  Execute: 'Delivery, build, testing, deployment preparation, and governance execution.',
  'Go-Live / Hypercare': 'Deployment, stabilization, hypercare defect tracking.',
  Close: 'Closure activities, final status, benefits handoff, and lessons learned.',
  Archive: 'Project archived after closure, rejection, or withdrawal.',
};

export const STATUSES: ProjectStatus[] = ['Active', 'On Hold', 'Withdrawn', 'Rejected', 'Closed Complete', 'Archived'];

export const stageIndex = (s: Stage) => STAGES.indexOf(s);
export const atOrAfter = (s: Stage, ref: Stage) => stageIndex(s) >= stageIndex(ref);

/** Stages in which NDA projects may run the confidential parallel workflow (PPM-FR-034). */
export const NDA_STAGES: Stage[] = ['Draft', 'Initiate', 'Plan', 'ACT Readiness', 'ACT Approved / Execute Ready'];

/** "Committed" (funded) vs "proposed" demand for capacity planning (RCP-FR-011). */
export const COMMITTED_STAGES: Stage[] = ['ACT Approved / Execute Ready', 'Execute', 'Go-Live / Hypercare'];
export const PROPOSED_STAGES: Stage[] = ['Draft', 'Initiate', 'Plan', 'ACT Readiness'];

export interface GateDef {
  key: GateKey;
  name: string;
  short: string;
  purpose: string;
  authority: string;
  from?: Stage;
  to?: Stage;
  allowedStages: Stage[];
  requiredFlag?: 'drbRequired' | 'crbRequired' | 'cabRequired';
}

export const GATES: GateDef[] = [
  { key: 'SG0', name: 'Stage Gate 0', short: 'SG0', purpose: 'Determine if intake is suitable to continue.', authority: 'PMO + Pillar Lead', from: 'Draft', to: 'Initiate', allowedStages: ['Draft'] },
  { key: 'SG1', name: 'Stage Gate 1', short: 'SG1', purpose: 'Determine if project can move from Initiate to Plan.', authority: 'PMO + Pillars', from: 'Initiate', to: 'Plan', allowedStages: ['Initiate'] },
  { key: 'SG2', name: 'Stage Gate 2', short: 'SG2', purpose: 'Determine if project can move from Plan to ACT Readiness.', authority: 'PMO + Pillars', from: 'Plan', to: 'ACT Readiness', allowedStages: ['Plan'] },
  { key: 'SG3', name: 'Stage Gate 3', short: 'SG3', purpose: 'Confirm formal ACT approval and readiness for Execute.', authority: 'Leadership / ACT approval evidence', from: 'ACT Readiness', to: 'ACT Approved / Execute Ready', allowedStages: ['ACT Readiness'] },
  { key: 'DRB', name: 'Design Review', short: 'DRB', purpose: 'Confirm solution/design completeness and feasibility.', authority: 'PMO + Pillars / Architects', allowedStages: ['Plan', 'ACT Readiness', 'ACT Approved / Execute Ready', 'Execute'], requiredFlag: 'drbRequired' },
  { key: 'CRB', name: 'Change Review Board', short: 'CRB', purpose: 'Review technical change accuracy and cross-team impact.', authority: 'Pillar Lead / Team Lead', allowedStages: ['ACT Approved / Execute Ready', 'Execute'], requiredFlag: 'crbRequired' },
  { key: 'GNG', name: 'Go/No-Go', short: 'Go/No-Go', purpose: 'Confirm project readiness for go-live.', authority: 'PMO + Pillars', allowedStages: ['Execute'] },
  { key: 'CAB', name: 'Change Advisory Board', short: 'CAB', purpose: 'Final change approval before production implementation.', authority: 'Pillar Leads / CAB authorities', allowedStages: ['Execute'], requiredFlag: 'cabRequired' },
];

export const gateDef = (k: GateKey) => GATES.find((g) => g.key === k)!;

export interface TransitionDef {
  key: TransitionKey;
  label: string;
  from: Stage;
  to: Stage;
}

export const TRANSITIONS: TransitionDef[] = [
  { key: 'START_EXECUTE', label: 'Start Execution', from: 'ACT Approved / Execute Ready', to: 'Execute' },
  { key: 'GO_LIVE', label: 'Go-Live & start Hypercare', from: 'Execute', to: 'Go-Live / Hypercare' },
  { key: 'CLOSE', label: 'Move to Close', from: 'Go-Live / Hypercare', to: 'Close' },
];

export const GATE_DECISIONS = ['Approve', 'Approve with Exception', 'Rework', 'Hold', 'Stop'] as const;

export const ROLES: Role[] = ['BRM', 'PMO_DIRECTOR', 'PMO_ADMIN', 'PM', 'BA', 'PILLAR_LEAD', 'ARCHITECT', 'SME', 'FINANCE', 'RTM', 'EXEC', 'SYS_ADMIN', 'EXTERNAL'];

export const ROLE_LABELS: Record<Role, string> = {
  BRM: 'Business Relationship Manager',
  PMO_DIRECTOR: 'PMO Director',
  PMO_ADMIN: 'PMO Program Administrator',
  PM: 'Project Manager',
  BA: 'Business Analyst',
  PILLAR_LEAD: 'Pillar Lead',
  ARCHITECT: 'Architect',
  SME: 'Business/Function SME',
  FINANCE: 'Finance',
  RTM: 'Resource Team Manager',
  EXEC: 'Executive / Portfolio Viewer',
  SYS_ADMIN: 'System Administrator',
  EXTERNAL: 'External Collaborator',
};

export const ROLE_SHORT: Record<Role, string> = {
  BRM: 'BRM',
  PMO_DIRECTOR: 'PMO Director',
  PMO_ADMIN: 'PMO Admin',
  PM: 'PM',
  BA: 'BA',
  PILLAR_LEAD: 'Pillar Lead',
  ARCHITECT: 'Architect',
  SME: 'SME',
  FINANCE: 'Finance',
  RTM: 'Resource Mgr',
  EXEC: 'Executive',
  SYS_ADMIN: 'Sys Admin',
  EXTERNAL: 'External',
};

export interface ArtifactDef {
  key: ArtifactKey;
  code: string;
  title: string;
  collection?: CollectionName;
  table?: string; // Dataverse table holding the artifact rows
  cadence: 'Weekly' | 'Monthly' | 'As needed' | 'Per event' | 'System';
  system?: boolean;
  tab?: string; // project workspace tab
}

/**
 * ART-FR-002 required artifacts. Each artifact is a Dataverse table whose rows are children of the
 * IT Project row (parental relationship), mirroring the existing template numbering.
 */
export const ARTIFACTS: ArtifactDef[] = [
  { key: 'stakeholders', code: '0.0', title: 'Stakeholder Register', collection: 'stakeholders', table: `${TABLE_PREFIX}stakeholder`, cadence: 'As needed', tab: 'people' },
  { key: 'projectRecord', code: '0.0a', title: 'Project Record', table: `${TABLE_PREFIX}itproject`, cadence: 'As needed', tab: 'overview' },
  { key: 'raci', code: '0.0b', title: 'Project RACI', collection: 'raci', table: `${TABLE_PREFIX}raciitem`, cadence: 'As needed', tab: 'people' },
  { key: 'brd', code: '1.0', title: 'BRD', collection: 'requirements', table: `${TABLE_PREFIX}requirement`, cadence: 'As needed', tab: 'requirements' },
  { key: 'plan', code: '2.0', title: 'Project Plan', collection: 'tasks', table: `${TABLE_PREFIX}plantask`, cadence: 'Weekly', tab: 'plan' },
  { key: 'resourceEstimator', code: '3.0', title: 'Resource Estimator Planning', collection: 'demands', table: `${TABLE_PREFIX}resourcedemand`, cadence: 'Monthly', tab: 'resources' },
  { key: 'budget', code: '3.5', title: 'Budget and Forecast', collection: 'forecastLines', table: `${TABLE_PREFIX}forecastline`, cadence: 'Monthly', tab: 'financials' },
  { key: 'costEstimator', code: '4.0', title: 'Cost Estimator', collection: 'costItems', table: `${TABLE_PREFIX}costitem`, cadence: 'As needed', tab: 'financials' },
  { key: 'raidd', code: '5.0', title: 'RAIDD Log', collection: 'raidd', table: `${TABLE_PREFIX}raidditem`, cadence: 'Weekly', tab: 'raidd' },
  { key: 'uatPlan', code: '6.0', title: 'UAT Test Plan', collection: 'testCases', table: `${TABLE_PREFIX}testcase`, cadence: 'Per event', tab: 'testing' },
  { key: 'uatDefects', code: '6.0b', title: 'UAT Defect Tracker', collection: 'uatDefects', table: `${TABLE_PREFIX}uatdefect`, cadence: 'Per event', tab: 'testing' },
  { key: 'cutover', code: '7.0', title: 'Cutover Plan', collection: 'cutoverTasks', table: `${TABLE_PREFIX}cutovertask`, cadence: 'Per event', tab: 'cutover' },
  { key: 'hypercare', code: '8.0', title: 'Hypercare Defect Tracker', collection: 'hypercareDefects', table: `${TABLE_PREFIX}hypercaredefect`, cadence: 'Per event', tab: 'cutover' },
  { key: 'status', code: '9.0', title: 'Weekly Status Tracker', collection: 'statusUpdates', table: `${TABLE_PREFIX}statusupdate`, cadence: 'Weekly', tab: 'status' },
  { key: 'metadata', code: 'x.0', title: 'Metadata', table: `${TABLE_PREFIX}itproject`, cadence: 'System', system: true, tab: 'overview' },
  { key: 'approvals', code: 'X.0b', title: 'Approvals', table: `${TABLE_PREFIX}gatereview`, cadence: 'System', system: true, tab: 'governance' },
  { key: 'dashboard', code: '—', title: 'Dashboard', cadence: 'System', system: true, tab: 'overview' },
];

export const artifactDef = (k: ArtifactKey) => ARTIFACTS.find((a) => a.key === k)!;
export const artifactForCollection = (c: CollectionName) => ARTIFACTS.find((a) => a.collection === c)!;

export interface CheckDef {
  id: string;
  label: string;
  artifact?: ArtifactKey;
}

/** Catalog of completeness checks used by stage gates (ART-FR-004 / OD-006). */
export const CHECKS: CheckDef[] = [
  { id: 'intakeComplete', label: 'Intake required fields complete', artifact: 'projectRecord' },
  { id: 'readyForReview', label: 'BRM marked intake Ready for Review' },
  { id: 'pmAssigned', label: 'Project Manager assigned', artifact: 'projectRecord' },
  { id: 'sponsorAssigned', label: 'Sponsor assigned', artifact: 'projectRecord' },
  { id: 'stakeholdersDefined', label: 'Stakeholder register populated (3+ stakeholders)', artifact: 'stakeholders' },
  { id: 'raciDefined', label: 'RACI has an Accountable party per deliverable', artifact: 'raci' },
  { id: 'brdHasRequirements', label: 'BRD contains requirements', artifact: 'brd' },
  { id: 'brdApproved', label: 'All BRD requirements approved', artifact: 'brd' },
  { id: 'planHasTasks', label: 'Project plan drafted', artifact: 'plan' },
  { id: 'planBaselined', label: 'Project plan baselined', artifact: 'plan' },
  { id: 'resourceDemandEntered', label: 'Resource estimate entered', artifact: 'resourceEstimator' },
  { id: 'resourceFeasibility', label: 'Resource feasibility: demand confirmed (no open gaps)', artifact: 'resourceEstimator' },
  { id: 'costEstimateDrafted', label: 'Cost estimate drafted', artifact: 'costEstimator' },
  { id: 'budgetForecastEntered', label: 'Budget forecast entered', artifact: 'budget' },
  { id: 'raiddStarted', label: 'RAIDD log started', artifact: 'raidd' },
  { id: 'statusCurrent', label: 'Weekly status current (≤ 7 days)', artifact: 'status' },
  { id: 'actNumberRecorded', label: 'ACT number & approval date recorded', artifact: 'projectRecord' },
  { id: 'wbsRecorded', label: 'WBS element recorded', artifact: 'budget' },
  { id: 'ndaConverted', label: 'NDA project converted to regular workflow' },
  { id: 'drbIfRequired', label: 'Design Review approved (if required)', artifact: 'approvals' },
  { id: 'crbIfRequired', label: 'CRB approved (if required)', artifact: 'approvals' },
  { id: 'cabIfRequired', label: 'CAB approved (if required)', artifact: 'approvals' },
  { id: 'gngApproved', label: 'Go/No-Go approved', artifact: 'approvals' },
  { id: 'uatPlanCreated', label: 'UAT test plan created', artifact: 'uatPlan' },
  { id: 'uatCoverage', label: 'All requirements have linked test coverage', artifact: 'uatPlan' },
  { id: 'uatExecuted', label: 'UAT executed (no Not Run / Failed cases)', artifact: 'uatPlan' },
  { id: 'uatDefectsResolved', label: 'No open P1/P2 UAT defects', artifact: 'uatDefects' },
  { id: 'cutoverPlanReady', label: 'Cutover plan prepared', artifact: 'cutover' },
  { id: 'hypercareDefectsClosed', label: 'No open hypercare defects', artifact: 'hypercare' },
];

export const checkLabel = (id: string) => CHECKS.find((c) => c.id === id)?.label ?? id;

export const DEFAULT_GATE_CHECKS: Record<string, string[]> = {
  SG0: ['intakeComplete', 'readyForReview'],
  SG1: ['pmAssigned', 'sponsorAssigned', 'stakeholdersDefined', 'brdHasRequirements', 'planHasTasks', 'resourceDemandEntered', 'costEstimateDrafted', 'raiddStarted'],
  SG2: ['raciDefined', 'brdApproved', 'planBaselined', 'resourceFeasibility', 'budgetForecastEntered', 'statusCurrent'],
  SG3: ['actNumberRecorded', 'resourceFeasibility'],
  DRB: ['brdApproved', 'planBaselined'],
  CRB: ['drbIfRequired'],
  GNG: ['uatPlanCreated', 'uatCoverage', 'uatExecuted', 'uatDefectsResolved', 'cutoverPlanReady', 'drbIfRequired', 'crbIfRequired'],
  CAB: ['gngApproved'],
  START_EXECUTE: ['ndaConverted', 'wbsRecorded'],
  GO_LIVE: ['gngApproved', 'cabIfRequired'],
  CLOSE: ['hypercareDefectsClosed', 'statusCurrent'],
};

export const DEFAULT_GATE_APPROVERS: Record<GateKey, Role[]> = {
  SG0: ['PMO_DIRECTOR', 'PMO_ADMIN', 'PILLAR_LEAD'],
  SG1: ['PMO_DIRECTOR', 'PMO_ADMIN', 'PILLAR_LEAD'],
  SG2: ['PMO_DIRECTOR', 'PMO_ADMIN', 'PILLAR_LEAD'],
  SG3: ['PMO_DIRECTOR', 'FINANCE'],
  DRB: ['PMO_DIRECTOR', 'PILLAR_LEAD', 'ARCHITECT'],
  CRB: ['PILLAR_LEAD', 'ARCHITECT'],
  GNG: ['PMO_DIRECTOR', 'PMO_ADMIN', 'PILLAR_LEAD'],
  CAB: ['PILLAR_LEAD', 'PMO_DIRECTOR'],
};

export const GOVERNANCE_DRIVERS = [
  'Risk',
  'Architecture impact',
  'Cross-functional impact',
  'Scope/schedule/budget impact',
  'Compliance',
  'Security',
  'Reliability',
  'Operations',
  'Documentation completeness',
];

export const RAIDD_PREFIX: Record<string, string> = {
  Risk: 'RI',
  Action: 'AC',
  Issue: 'IS',
  Decision: 'DE',
  Dependency: 'DP',
  Assumption: 'AS',
  'Change Request': 'CR',
};

export const RACI_COLUMNS: { key: string; label: string }[] = [
  { key: 'sponsor', label: 'Project Sponsor' },
  { key: 'brm', label: 'BRM' },
  { key: 'ba', label: 'BA' },
  { key: 'itDeliveryLead', label: 'IT Delivery Lead' },
  { key: 'pm', label: 'Project Manager' },
  { key: 'integrationLead', label: 'Integration Lead' },
  { key: 'technicalLead', label: 'Technical Lead' },
  { key: 'infrastructureLead', label: 'Infrastructure Lead' },
  { key: 'cyberLead', label: 'Cyber Lead' },
  { key: 'insightsLead', label: 'Insights Lead' },
  { key: 'applicationsLead', label: 'Applications Lead' },
  { key: 'commsLead', label: 'Comms Lead' },
  { key: 'businessSme', label: 'Business SME' },
];

/** Standard RACI rows (from the 0.0b Project RACI template). */
export const RACI_DELIVERABLES: [string, Record<string, string>][] = [
  ['Business Requirements', { sponsor: 'A', brm: 'R', itDeliveryLead: 'I' }],
  ['Resource Estimation Worksheet', { brm: 'A/R', itDeliveryLead: 'I' }],
  ['ACT Approval', { sponsor: 'A', brm: 'R', itDeliveryLead: 'I' }],
  ['Resource Planning (Resource Module)', { brm: 'A', pm: 'R', technicalLead: 'C' }],
  ['Project Plan', { sponsor: 'I', brm: 'I', itDeliveryLead: 'A', pm: 'R', technicalLead: 'C' }],
  ['UAT - Test Plan build-out', { sponsor: 'I', brm: 'I', pm: 'A', ba: 'R' }],
  ['UAT - Defect Tracker', { sponsor: 'I', brm: 'I', pm: 'A', technicalLead: 'C' }],
  ['Cutover Plan', { sponsor: 'C', brm: 'I', itDeliveryLead: 'A', pm: 'R', technicalLead: 'C' }],
  ['Cutover Execution', { sponsor: 'I', brm: 'I', itDeliveryLead: 'I', pm: 'A', technicalLead: 'R' }],
  ['Go/No-go decision', { sponsor: 'A', pm: 'R', technicalLead: 'C' }],
  ['Financial Actuals', { sponsor: 'I', brm: 'I', pm: 'A/R' }],
  ['Project Kickoff', { sponsor: 'I', brm: 'I', itDeliveryLead: 'I', pm: 'A/R', technicalLead: 'C' }],
  ['Cyber Security Assessment', { sponsor: 'I', brm: 'I', pm: 'A', cyberLead: 'R' }],
  ['DRB - Architecture Diagram build-out', { sponsor: 'I', brm: 'I', pm: 'A', technicalLead: 'R' }],
  ['DRB Approval', { sponsor: 'I', brm: 'I', itDeliveryLead: 'I', pm: 'A/R', technicalLead: 'C' }],
  ['Communications', { sponsor: 'I', brm: 'I', pm: 'A', commsLead: 'R' }],
  ['Purchase Orders / Agreements', { sponsor: 'I', brm: 'A', pm: 'R' }],
];

/** Standard WBS template (from the 2.0 Project Plan template). */
export const PLAN_TEMPLATE: { phase: string; tasks: { name: string; type?: 'Milestone' | 'Gate' }[] }[] = [
  {
    phase: 'Initiate',
    tasks: [
      { name: 'Submit project into PPM tool' },
      { name: 'Complete Project Record' },
      { name: 'Document High Level Requirements in BRD' },
      { name: 'Draft Project Plan' },
      { name: 'Input labor estimate into Resource Estimator' },
      { name: 'Input estimated non-labor costs in Cost Estimator' },
      { name: 'Enter any known or assumed RAIDD items' },
      { name: 'Stage Gate 1 Approval', type: 'Gate' },
    ],
  },
  {
    phase: 'Plan',
    tasks: [
      { name: 'Project Planning Kickoff', type: 'Milestone' },
      { name: 'Document Detailed Requirements in BRD & Perform Requirements Analysis' },
      { name: 'Solution Estimate Kick Off with Solution Teams' },
      { name: 'Define solution (include SOW), enter deliverables in BRD' },
      { name: 'Refine Labor Estimate in Resource Estimator' },
      { name: 'Review project details with applicable pillars (Infra, Cyber, Applications, I&A)' },
      { name: 'Review Disaster Recovery requirements' },
      { name: 'Business Solution Review (IT and Business)', type: 'Milestone' },
      { name: 'Validate PPM & ACT align on financials, project details, and documentation' },
      { name: 'Stage Gate 2 – ACT Readiness Review Approval', type: 'Gate' },
      { name: 'Submit ACT' },
      { name: 'Stage Gate 3 – ACT approved', type: 'Gate' },
    ],
  },
  { phase: 'Execute Kickoff', tasks: [{ name: 'Execute Kickoff', type: 'Milestone' }] },
  { phase: 'Detailed Design', tasks: [{ name: 'Design workshops' }, { name: 'Solution blueprint document' }] },
  { phase: 'Design Review Board', tasks: [{ name: 'Design Review Board meeting', type: 'Gate' }, { name: 'Blueprint sign-off', type: 'Milestone' }] },
  { phase: 'Build', tasks: [{ name: 'System configuration' }, { name: 'Development / enhancements' }, { name: 'Unit test' }] },
  { phase: 'System Integration Testing', tasks: [{ name: 'Execute SIT scripts' }] },
  { phase: 'User Acceptance Test', tasks: [{ name: 'UAT test plan' }, { name: 'Key user training' }, { name: 'Track UAT defects' }, { name: 'UAT sign-off', type: 'Milestone' }] },
  { phase: 'Go / No-Go', tasks: [{ name: 'Go / No-Go meeting to proceed to cutover', type: 'Gate' }] },
  { phase: 'Cutover', tasks: [{ name: 'Cutover plan' }, { name: 'CAB approval', type: 'Gate' }, { name: 'Cutover execution' }] },
  { phase: 'Go-Live', tasks: [{ name: 'Go-Live with solution', type: 'Milestone' }] },
  { phase: 'Hypercare', tasks: [{ name: 'Track hypercare defects' }, { name: 'System monitoring / operation support' }] },
  { phase: 'Close', tasks: [{ name: 'Lessons learned' }, { name: 'Benefits handoff' }, { name: 'Project closure', type: 'Milestone' }] },
];

/** Cost Estimator category tree (from the 4.0 Cost Estimator template), created under CAPEX and OPEX. */
export const COST_TEMPLATE: { area: string; items: string[] }[] = [
  { area: 'Infrastructure', items: ['Servers', 'Network', 'Wireless Coverage'] },
  { area: 'Applications', items: ['Application licenses / subscriptions', 'Application enhancements'] },
  { area: 'Insights', items: ['Data Analytics Software', 'SAP BW', 'I&A Azure'] },
  { area: 'Software Engineering', items: ['Integrations (Mulesoft / SAP / Salesforce / Workday / EDI)'] },
  { area: 'Cyber Security', items: ['Risk Assessment', 'Access / Licenses', 'Security Monitoring / Pen Test'] },
  { area: 'PMO', items: [] },
];

export const DEFAULT_CONFIG: AppConfig = {
  internalDomains: [BRAND.emailDomain],
  gateApprovers: DEFAULT_GATE_APPROVERS,
  gateChecks: DEFAULT_GATE_CHECKS,
  statusRequiredStages: ['Plan', 'ACT Readiness', 'ACT Approved / Execute Ready', 'Execute', 'Go-Live / Hypercare'],
  externalAccessMaxDays: 180,
  expiryWarningDays: 7,
  accessReviewIntervalDays: 90,
  budgetTolerancePct: 2,
  scheduleYellowDays: 5,
  scheduleRedDays: 15,
  resourceGapRedDays: 30,
  workdaysOverride: {},
  powerBiReportUrl: '',
  masterData: {
    businessAreas: ['Cloud Solutions', 'Consumer Devices', 'Industrial Products', 'Services', 'Corporate'],
    businessFunctions: ['Finance', 'Supply Chain', 'Sales & Order Management', 'Operations / Manufacturing', 'Engineering', 'Customer Service', 'Human Resources', 'Marketing', 'Procurement', 'Legal & Compliance', 'IT'],
    corporatePriorities: ['Ops Excellence', 'Profitable Growth', 'Customer Experience', 'Digital Transformation', 'Risk & Compliance', 'People & Culture'],
    benefitTypes: ['Cost Savings', 'Cost Avoidance', 'Revenue Growth', 'Tax Benefit', 'Risk Mitigation / Compliance', 'Productivity', 'Customer Experience'],
    roadmapOptions: ['On FY26 IT Roadmap', 'On FY27 IT Roadmap', 'Not on IT Roadmap'],
    pillars: ['Applications', 'Infrastructure', 'Cyber Security', 'Insights & Analytics', 'Software Engineering', 'PMO'],
    programs: ['ERP Modernization', 'Digital Customer', 'Smart Plant', 'Cyber Resilience'],
    applications: ['SAP ECC', 'SAP S/4HANA', 'SAP BW', 'Salesforce', 'Workday', 'Ariba', 'Mulesoft', 'PTC Windchill', 'ServiceNow', 'Azure Data Platform', 'Manhattan WMS', 'Dealer Portal', 'Power BI'],
    categories: ['Applications', 'Infrastructure', 'Cyber Security', 'Insights', 'Software Engineering', 'PMO'],
    specialties: ['Architect', 'Developer', 'Business Analyst', 'Project Manager', 'Functional Consultant', 'Infrastructure Engineer', 'Security Analyst', 'Data Engineer', 'QA / Tester', 'Change Manager'],
    spendCategories: ['Internal Labor', 'External Labor', 'Vendor', 'Hardware', 'Software / Licenses', 'Contingency', 'Other'],
    hoursBuckets: ['< 250 hrs', '250 – 1,000 hrs', '1,000 – 5,000 hrs', '> 5,000 hrs'],
  },
};

export const HEALTH_VALUES = ['Green', 'Yellow', 'Red'] as const;
