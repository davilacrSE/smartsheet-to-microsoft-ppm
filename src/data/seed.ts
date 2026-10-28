/**
 * Sample data (fictional people and projects) used by the local preview and, optionally, loaded into Dataverse
 * with `npm run dataverse:provision -- --seed`. Every project is flagged demo=true so it can be removed later.
 */
import type { EntityName, Health, Project, Rec, Stage, User } from '../domain/types';
import { COST_TEMPLATE, PLAN_TEMPLATE, RACI_DELIVERABLES, RAIDD_PREFIX, STAGES } from '../domain/constants';
import { addDays, monthRange, overallHealth, ym } from '../domain/calc';
import { BRAND } from '../brand';

const D = BRAND.emailDomain;

export const SEED_ORDER: EntityName[] = [
  'users', 'teams', 'resources', 'assignments', 'projects', 'stakeholders', 'raci', 'requirements', 'tasks', 'demands',
  'forecastLines', 'forecastEntries', 'costItems', 'raidd', 'testCases', 'traces', 'uatDefects', 'cutoverTasks',
  'hypercareDefects', 'statusUpdates', 'gateReviews', 'exceptions', 'ndaAccess', 'accessGrants', 'actuals', 'scenarios',
  'notifications', 'auditEvents',
];

const uuid = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((Math.random() * 16) | (c === 'x' ? 0 : 8)).toString(16));

type PersonaKey =
  | 'brm1' | 'brm2' | 'pmodir' | 'pmoadm' | 'pm1' | 'pm2' | 'ba1' | 'pillar1' | 'pillar2' | 'arch' | 'fin' | 'rtm1' | 'rtm2'
  | 'exec' | 'admin' | 'sponsor1' | 'sponsor2' | 'sme' | 'ext1' | 'ext2';

const PERSONAS: [PersonaKey, string, string, User['roles'], string, string?][] = [
  ['pmodir', 'Elena Vasquez', `elena.vasquez@${D}`, ['PMO_DIRECTOR'], 'Director, IT PMO', 'PMO'],
  ['pmoadm', 'Sam Okafor', `sam.okafor@${D}`, ['PMO_ADMIN'], 'PMO Program Administrator', 'PMO'],
  ['brm1', 'Morgan Reyes', `morgan.reyes@${D}`, ['BRM'], 'Business Relationship Manager – Cloud Solutions'],
  ['brm2', 'Priya Natarajan', `priya.natarajan@${D}`, ['BRM'], 'Business Relationship Manager – Consumer Devices'],
  ['pm1', 'Jordan Blake', `jordan.blake@${D}`, ['PM'], 'Senior Project Manager', 'PMO'],
  ['pm2', 'Aisha Rahman', `aisha.rahman@${D}`, ['PM'], 'Project Manager', 'PMO'],
  ['ba1', 'Chris Lindqvist', `chris.lindqvist@${D}`, ['BA'], 'Business Analyst', 'PMO'],
  ['pillar1', 'Daniel Kim', `daniel.kim@${D}`, ['PILLAR_LEAD'], 'Director, Enterprise Applications', 'Applications'],
  ['pillar2', 'Grace Thompson', `grace.thompson@${D}`, ['PILLAR_LEAD'], 'Director, Infrastructure & Cyber', 'Infrastructure'],
  ['arch', 'Ravi Menon', `ravi.menon@${D}`, ['ARCHITECT'], 'Enterprise Architect', 'Applications'],
  ['fin', 'Laura Chen', `laura.chen@${D}`, ['FINANCE'], 'IT Finance Manager'],
  ['rtm1', 'Marcus Webb', `marcus.webb@${D}`, ['RTM'], 'Resource Manager – Applications', 'Applications'],
  ['rtm2', 'Nina Petrova', `nina.petrova@${D}`, ['RTM'], 'Resource Manager – Engineering & Infrastructure', 'Software Engineering'],
  ['exec', 'Victoria Hale', `victoria.hale@${D}`, ['EXEC'], 'Chief Information Officer'],
  ['admin', 'Tom Becker', `tom.becker@${D}`, ['SYS_ADMIN'], 'PPM System Administrator', 'PMO'],
  ['sponsor1', 'Hannah Brooks', `hannah.brooks@${D}`, ['SME'], 'VP Finance – Cloud Solutions'],
  ['sponsor2', 'Luis Ortega', `luis.ortega@${D}`, ['SME'], 'VP Sales – Consumer Devices'],
  ['sme', 'Omar Haddad', `omar.haddad@${D}`, ['SME'], 'Supply Chain Process Lead'],
  ['ext1', 'Dana Whitfield', 'dana.whitfield@fabrikam-consulting.example', ['EXTERNAL'], 'Consultant, Fabrikam Consulting'],
  ['ext2', 'Kenji Sato', 'kenji.sato@litware-erp-partners.example', ['EXTERNAL'], 'Solution Lead, Litware ERP Partners'],
];

const TEAMS: [string, string, string, PersonaKey][] = [
  ['sapfin', 'Apps - SAP Finance', 'Applications', 'rtm1'],
  ['saplog', 'Apps - SAP Logistics', 'Applications', 'rtm1'],
  ['sapsd', 'Apps - Sales & Order Management', 'Applications', 'rtm1'],
  ['integ', 'SW Eng. - Integration (Mulesoft)', 'Software Engineering', 'rtm2'],
  ['web', 'SW Eng. - Web & Mobile', 'Software Engineering', 'rtm2'],
  ['infra', 'Infrastructure - Network & Data Center', 'Infrastructure', 'rtm2'],
  ['cyber', 'Cyber - Identity & Access', 'Cyber Security', 'rtm2'],
  ['data', 'Insights - Data Engineering', 'Insights & Analytics', 'rtm2'],
  ['ba', 'PMO - Business Analysis', 'PMO', 'rtm1'],
];

// [name, type, specialty, [team, weeklyHours, utilization%][], org?]
const RESOURCES: [string, 'Internal' | 'External' | 'Staff Augmentation', string, [string, number, number][], string?][] = [
  ['Alex Moreno', 'Internal', 'Functional Consultant', [['sapfin', 40, 80]]],
  ['Beth Collins', 'Internal', 'Functional Consultant', [['sapfin', 30, 75], ['saplog', 10, 75]]],
  ['Carlos Diaz', 'External', 'Architect', [['sapfin', 40, 90]], 'Litware ERP Partners'],
  ['Deepa Iyer', 'Internal', 'Functional Consultant', [['saplog', 40, 80]]],
  ['Ethan Park', 'Staff Augmentation', 'Developer', [['saplog', 40, 90]], 'Proseware Staffing'],
  ['Fatima Noor', 'Internal', 'Functional Consultant', [['sapsd', 40, 75]]],
  ['George Lin', 'Internal', 'Developer', [['sapsd', 20, 70], ['integ', 20, 70]]],
  ['Hector Silva', 'Internal', 'Developer', [['integ', 40, 85]]],
  ['Irene Walsh', 'External', 'Developer', [['integ', 40, 90]], 'Fabrikam Consulting'],
  ['Jamal Carter', 'Internal', 'Developer', [['web', 40, 80]]],
  ['Kara Nguyen', 'Staff Augmentation', 'Developer', [['web', 40, 90]], 'Proseware Staffing'],
  ['Liam Foster', 'Internal', 'Infrastructure Engineer', [['infra', 40, 70]]],
  ['Maya Patel', 'Internal', 'Infrastructure Engineer', [['infra', 40, 70]]],
  ['Noah Brooks', 'Internal', 'Security Analyst', [['cyber', 40, 75]]],
  ['Olivia Grant', 'External', 'Security Analyst', [['cyber', 40, 90]], 'Woodgrove Security'],
  ['Pablo Ruiz', 'Internal', 'Data Engineer', [['data', 40, 80]]],
  ['Quinn Adler', 'Internal', 'Data Engineer', [['data', 32, 80]]],
  ['Rosa Mendes', 'Internal', 'Business Analyst', [['ba', 40, 85]]],
  ['Sanjay Rao', 'Internal', 'Business Analyst', [['ba', 40, 85]]],
  ['Tara Quinn', 'Internal', 'QA / Tester', [['sapfin', 20, 80], ['saplog', 20, 80]]],
];

interface Spec {
  code: string;
  name: string;
  codename?: string;
  stage: Stage;
  status?: Project['status'];
  ready?: boolean;
  biz: string;
  fn: string;
  prio: string;
  pillar: string;
  program?: string;
  brm: PersonaKey;
  pm?: PersonaKey;
  ba?: PersonaKey;
  sponsor?: PersonaKey;
  cost: number;
  benefit: number;
  benefitType: string;
  start: number; // days from today
  exec: number;
  golive: number;
  agile?: boolean;
  itgc?: boolean;
  health?: [Health, Health, Health, Health];
  drb?: boolean;
  crb?: boolean;
  cab?: boolean;
  teams: string[];
  wbs?: boolean;
  forecastFactor?: number;
  objective: string;
  outcome: string;
  apps: string;
}

const SPECS: Spec[] = [
  { code: 'ITProj-26-001', name: 'SAP S/4HANA Finance Close Automation', stage: 'Execute', biz: 'Cloud Solutions', fn: 'Finance', prio: 'Ops Excellence', pillar: 'Applications', program: 'ERP Modernization', brm: 'brm1', pm: 'pm1', ba: 'ba1', sponsor: 'sponsor1', cost: 850000, benefit: 1400000, benefitType: 'Cost Savings', start: -210, exec: -95, golive: 45, itgc: true, health: ['Green', 'Yellow', 'Green', 'Green'], drb: true, cab: true, teams: ['sapfin', 'integ', 'ba'], wbs: true, forecastFactor: 1.015, objective: 'Automate intercompany reconciliation and period-end close activities in SAP S/4HANA Finance.', outcome: 'Reduce month-end close from 9 to 5 business days and eliminate manual reconciliations.', apps: 'SAP S/4HANA, Mulesoft, BlackLine' },
  { code: 'ITProj-26-002', name: 'Dealer Portal Modernization', stage: 'Plan', biz: 'Consumer Devices', fn: 'Sales & Order Management', prio: 'Customer Experience', pillar: 'Software Engineering', program: 'Digital Customer', brm: 'brm2', pm: 'pm2', ba: 'ba1', sponsor: 'sponsor2', cost: 1200000, benefit: 2600000, benefitType: 'Revenue Growth', start: -75, exec: 40, golive: 220, agile: true, health: ['Green', 'Green', 'Yellow', 'Green'], drb: true, cab: true, teams: ['web', 'integ', 'sapsd'], objective: 'Replace the legacy dealer portal with a modern, mobile-friendly experience integrated with Salesforce and SAP.', outcome: 'Self-service ordering and warranty claims for 1,400 dealers; 20% reduction in dealer support calls.', apps: 'Dealer Portal, Salesforce, SAP ECC' },
  { code: 'ITProj-26-003', name: 'Plant Network Refresh – North America', stage: 'ACT Readiness', biz: 'Industrial Products', fn: 'Operations / Manufacturing', prio: 'Ops Excellence', pillar: 'Infrastructure', program: 'Smart Plant', brm: 'brm1', pm: 'pm1', sponsor: 'sponsor1', cost: 640000, benefit: 300000, benefitType: 'Risk Mitigation / Compliance', start: -120, exec: 20, golive: 150, health: ['Green', 'Green', 'Yellow', 'Green'], cab: true, teams: ['infra', 'cyber'], objective: 'Replace end-of-life plant floor switches, wireless controllers and firewalls.', outcome: 'Eliminate unsupported network hardware and enable IIoT sensor rollout.', apps: 'Plant network, Wireless LAN' },
  { code: 'ITProj-26-004', name: 'Strategic Acquisition Systems Integration', codename: 'Project Falcon', stage: 'Plan', biz: 'Corporate', fn: 'Finance', prio: 'Profitable Growth', pillar: 'Applications', brm: 'brm1', pm: 'pm2', sponsor: 'sponsor1', cost: 2100000, benefit: 5000000, benefitType: 'Revenue Growth', start: -40, exec: 60, golive: 300, health: ['Green', 'Green', 'Green', 'Green'], drb: true, crb: true, cab: true, teams: ['sapfin', 'integ'], objective: 'Plan the day-one systems integration of a confidential acquisition target.', outcome: 'Financial consolidation and order-to-cash continuity from close date.', apps: 'SAP S/4HANA, Workday' },
  { code: 'ITProj-26-005', name: 'Workday Recruiting Integration', stage: 'Draft', ready: true, biz: 'Corporate', fn: 'Human Resources', prio: 'People & Culture', pillar: 'Software Engineering', brm: 'brm2', cost: 180000, benefit: 240000, benefitType: 'Productivity', start: 20, exec: 80, golive: 170, teams: ['integ'], objective: 'Integrate Workday Recruiting with the background-check vendor and SAP payroll onboarding.', outcome: 'Cut time-to-hire by 6 days and remove duplicate data entry.', apps: 'Workday, Mulesoft' },
  { code: 'ITProj-26-006', name: 'Warehouse Management System Upgrade', stage: 'Go-Live / Hypercare', biz: 'Cloud Solutions', fn: 'Supply Chain', prio: 'Ops Excellence', pillar: 'Applications', program: 'ERP Modernization', brm: 'brm1', pm: 'pm2', ba: 'ba1', sponsor: 'sponsor1', cost: 720000, benefit: 950000, benefitType: 'Cost Savings', start: -330, exec: -220, golive: -10, health: ['Green', 'Green', 'Green', 'Yellow'], drb: true, crb: true, cab: true, teams: ['saplog', 'integ'], wbs: true, forecastFactor: 1.01, objective: 'Upgrade Manhattan WMS and modernize RF scanning in two distribution centers.', outcome: 'Increase pick accuracy to 99.8% and retire unsupported WMS version.', apps: 'Manhattan WMS, SAP EWM interfaces' },
  { code: 'ITProj-26-007', name: 'Field Service Mobile App', stage: 'Initiate', biz: 'Consumer Devices', fn: 'Customer Service', prio: 'Customer Experience', pillar: 'Software Engineering', program: 'Digital Customer', brm: 'brm2', pm: 'pm2', sponsor: 'sponsor2', cost: 420000, benefit: 700000, benefitType: 'Productivity', start: -14, exec: 90, golive: 240, agile: true, teams: ['web', 'integ'], objective: 'Give field technicians a mobile app for work orders, parts and warranty validation.', outcome: 'First-time fix rate +8 pts; paperless service visits.', apps: 'Salesforce Field Service, SAP ECC' },
  { code: 'ITProj-26-008', name: 'Enterprise Data Platform Migration to Azure', stage: 'Execute', biz: 'Corporate', fn: 'IT', prio: 'Digital Transformation', pillar: 'Insights & Analytics', brm: 'brm2', pm: 'pm1', ba: 'ba1', sponsor: 'exec', cost: 980000, benefit: 1100000, benefitType: 'Cost Avoidance', start: -260, exec: -150, golive: 75, agile: true, health: ['Green', 'Green', 'Green', 'Green'], drb: true, cab: true, teams: ['data', 'infra'], wbs: true, forecastFactor: 0.97, objective: 'Migrate the on-premise SAP BW and SQL data warehouse to the Azure data platform.', outcome: 'Retire on-premise warehouse hardware; enable self-service analytics in Power BI.', apps: 'SAP BW, Azure Data Platform, Power BI' },
  { code: 'ITProj-26-009', name: 'EDI Partner Onboarding Automation', stage: 'Close', biz: 'Cloud Solutions', fn: 'Sales & Order Management', prio: 'Ops Excellence', pillar: 'Software Engineering', brm: 'brm1', pm: 'pm1', sponsor: 'sponsor2', cost: 260000, benefit: 410000, benefitType: 'Cost Savings', start: -380, exec: -280, golive: -60, health: ['Green', 'Green', 'Green', 'Green'], cab: true, teams: ['integ'], wbs: true, forecastFactor: 0.96, objective: 'Automate onboarding of EDI trading partners through Mulesoft templates.', outcome: 'Onboarding time per partner from 6 weeks to 10 days.', apps: 'Mulesoft, SAP ECC EDI' },
  { code: 'ITProj-26-010', name: 'Identity Governance & Administration (IGA)', stage: 'ACT Approved / Execute Ready', biz: 'Corporate', fn: 'IT', prio: 'Risk & Compliance', pillar: 'Cyber Security', program: 'Cyber Resilience', brm: 'brm2', pm: 'pm1', sponsor: 'exec', cost: 560000, benefit: 200000, benefitType: 'Risk Mitigation / Compliance', start: -150, exec: 10, golive: 200, itgc: true, health: ['Green', 'Green', 'Green', 'Green'], drb: true, cab: true, teams: ['cyber', 'integ'], objective: 'Implement automated joiner/mover/leaver provisioning and quarterly access certification.', outcome: 'Close ITGC access-review findings; 90% of access provisioned automatically.', apps: 'Entra ID, SAP GRC, Workday' },
  { code: 'ITProj-26-011', name: 'Customer Warranty Analytics', stage: 'Draft', biz: 'Consumer Devices', fn: 'Customer Service', prio: 'Customer Experience', pillar: 'Insights & Analytics', brm: 'brm2', cost: 150000, benefit: 380000, benefitType: 'Cost Savings', start: 45, exec: 100, golive: 190, teams: ['data'], objective: 'Analyze warranty claim patterns to identify product quality issues earlier.', outcome: 'Reduce warranty cost per unit by 4%.', apps: 'Power BI, Salesforce' },
  { code: 'ITProj-26-012', name: 'Legacy Fax Server Retirement', stage: 'Archive', status: 'Archived', biz: 'Corporate', fn: 'IT', prio: 'Ops Excellence', pillar: 'Infrastructure', brm: 'brm1', pm: 'pm2', sponsor: 'exec', cost: 60000, benefit: 45000, benefitType: 'Cost Savings', start: -420, exec: -360, golive: -300, health: ['Green', 'Green', 'Green', 'Green'], teams: ['infra'], wbs: true, forecastFactor: 0.92, objective: 'Retire the legacy on-premise fax servers and move to cloud fax.', outcome: 'Decommission 4 servers and reduce telecom costs.', apps: 'Fax servers' },
];

const REQS: [string, 'Business' | 'Functional' | 'Technical', string[]][] = [
  ['Business outcomes', 'Business', ['Deliver the benefits case approved at intake', 'Provide KPI reporting to business leadership', 'Comply with corporate data retention and audit policies']],
  ['Process & functional', 'Functional', ['Users can create, review and approve transactions in the new process', 'System validates mandatory data before submission', 'Role-based access restricts sensitive functions', 'Pending approvals generate notifications']],
  ['Technical', 'Technical', ['Integrate with SAP through Mulesoft APIs', 'Single sign-on with Entra ID', 'Key screens respond in under 3 seconds']],
];

export function buildSeed(now: Date, _adminEmail?: string): Record<EntityName, any[]> {
  const out = Object.fromEntries(SEED_ORDER.map((e) => [e, [] as any[]])) as Record<EntityName, any[]>;
  const today = now.toISOString().slice(0, 10);
  const D = (off: number) => addDays(today, Math.round(off));
  const T = (off: number, hour = 15) => `${D(off)}T${String(hour).padStart(2, '0')}:00:00.000Z`;
  const clampPast = (off: number) => Math.min(off, -1);

  // People
  const P: Record<string, User> = {};
  for (const [key, name, email, roles, title, pillar] of PERSONAS) {
    const external = roles.includes('EXTERNAL');
    P[key] = { id: uuid(), name, email, roles, title, pillar, external, active: true, notifyEmail: true, notifyTeams: !external };
    out.users.push(P[key]);
  }
  const pid = (k?: PersonaKey) => (k ? P[k].id : undefined);

  // Teams & resources
  const TEAM: Record<string, string> = {};
  for (const [key, name, pillar, mgr] of TEAMS) {
    TEAM[key] = uuid();
    out.teams.push({ id: TEAM[key], name, pillar, managerId: P[mgr].id });
  }
  const teamResources: Record<string, string[]> = {};
  for (const [name, resourceType, specialty, assigns, org] of RESOURCES) {
    const id = uuid();
    out.resources.push({ id, name, email: `${name.toLowerCase().replace(/ /g, '.')}@${org ? org.toLowerCase().replace(/[^a-z]+/g, '-') + '.example' : D}`, resourceType, specialty, organization: org, active: true, startDate: D(-720) });
    for (const [t, hrs, util] of assigns) {
      out.assignments.push({ id: uuid(), resourceId: id, teamId: TEAM[t], weeklyHours: hrs, utilizationPct: util });
      (teamResources[t] ||= []).push(id);
    }
  }

  // Delivery-team resources who own artifact rows get a PPM profile, as picking them in the people picker would.
  const person = (name: string) => {
    let u = out.users.find((x) => x.name === name);
    if (!u) {
      const r = out.resources.find((x) => x.name === name)!;
      const external = !r.email.endsWith(`@${D}`);
      u = { id: uuid(), name, email: r.email, title: r.specialty, roles: external ? ['EXTERNAL'] : [], external, active: true, notifyEmail: true, notifyTeams: !external };
      out.users.push(u);
    }
    return u.id;
  };

  const audit = (ts: string, user: User, action: string, projectId: string, details: string, entity = 'IT Project') =>
    out.auditEvents.push({ id: uuid(), ts, userId: user.id, userEmail: user.email, action, entity, entityId: projectId, projectId, details });
  const notify = (user: User, projectId: string | undefined, type: string, title: string, body: string, link: string, offDays: number, read = false) =>
    out.notifications.push({ id: uuid(), userId: user.id, projectId, type, title, body, link, channels: user.external ? ['email'] : ['email', 'teams'], sentAt: T(offDays, 13), read });

  const projects: Record<string, Project> = {};

  for (const s of SPECS) {
    const si = STAGES.indexOf(s.stage);
    const id = uuid();
    const g = {
      SG0: s.start,
      SG1: s.start + 0.2 * (s.exec - s.start),
      SG2: s.start + 0.6 * (s.exec - s.start),
      SG3: s.exec - 10,
      DRB: s.exec + 0.22 * (s.golive - s.exec),
      CRB: s.exec + 0.6 * (s.golive - s.exec),
      GNG: s.golive - 8,
      CAB: s.golive - 4,
    };
    const passed = (gate: keyof typeof g) => {
      const need = { SG0: 1, SG1: 2, SG2: 3, SG3: 4, DRB: 5, CRB: 6, GNG: 6, CAB: 6 }[gate];
      if (si < need) return false;
      if (gate === 'DRB' && (!s.drb || g.DRB > -1)) return false;
      if (gate === 'CRB' && !s.crb) return false;
      if (gate === 'CAB' && !s.cab) return false;
      return true;
    };
    const ndaList: PersonaKey[] = s.codename ? ['pmodir', 'brm1', 'pm2', 'fin', 'pillar1', 'ext2'] : [];
    const health = s.health && si >= 2 ? s.health : undefined;
    const hasAct = si >= 4;
    const p: Project = {
      id,
      code: s.code,
      projectType: 'Project',
      name: s.name,
      mainObjective: s.objective,
      desiredOutcome: s.outcome,
      estimatedCost: s.cost,
      estimatedBenefit: s.benefit,
      benefitType: s.benefitType,
      roadmapAlignment: s.program ? 'On FY26 IT Roadmap' : 'Not on IT Roadmap',
      plannedInitiateDate: D(s.start),
      plannedExecuteDate: D(s.exec),
      plannedGoLiveDate: D(s.golive),
      plannedEndDate: D(s.golive + 45),
      brmId: P[s.brm].id,
      businessArea: s.biz,
      businessFunction: s.fn,
      corporatePriority: s.prio,
      program: s.program,
      pillar: s.pillar,
      agile: !!s.agile,
      itgc: !!s.itgc,
      itgcApplications: s.itgc ? s.apps : undefined,
      transformation: s.biz === 'Corporate' && !!s.program,
      stage: s.stage,
      status: s.status ?? (s.stage === 'Archive' ? 'Archived' : 'Active'),
      readyForReview: si >= 1 || !!s.ready,
      readyForReviewAt: si >= 1 || s.ready ? T(si >= 1 ? s.start - 7 : -3, 14) : undefined,
      createdById: P[s.brm].id,
      createdAt: T(si >= 1 ? s.start - 14 : -10, 14),
      approvalDate: si >= 1 ? T(g.SG0) : undefined,
      stageEnteredAt: T(si >= 1 ? Math.min(-2, [g.SG0, g.SG0, g.SG1, g.SG2, g.SG3, s.exec, s.golive, s.golive + 30, s.golive + 60][si]) : -10),
      sponsorId: pid(s.sponsor),
      pmId: pid(s.pm),
      baId: pid(s.ba),
      itDeliveryLeadId: si >= 1 ? (s.pillar === 'Infrastructure' || s.pillar === 'Cyber Security' ? P.pillar2.id : P.pillar1.id) : undefined,
      technicalLeadId: si >= 1 ? P.arch.id : undefined,
      architectId: si >= 2 ? P.arch.id : undefined,
      estHoursBucket: s.cost > 800000 ? '1,000 – 5,000 hrs' : '250 – 1,000 hrs',
      existingApplications: s.apps,
      businessOwnerApps: s.sponsor ? P[s.sponsor].name : undefined,
      dataMigration: s.pillar !== 'Infrastructure',
      integrationWork: s.teams.includes('integ') ? 'Mulesoft APIs to SAP / Salesforce' : undefined,
      infrastructureWork: s.teams.includes('infra') ? 'Network and hosting changes' : undefined,
      cyberWork: s.teams.includes('cyber') || s.itgc ? 'Access model and security review' : undefined,
      insightWork: s.teams.includes('data') ? 'Reporting and data model changes' : undefined,
      actNumber: hasAct ? `${s.biz === 'Cloud Solutions' ? 'CS' : s.biz === 'Consumer Devices' ? 'CD' : s.biz === 'Industrial Products' ? 'IP' : 'CO'}-26-0${s.code.slice(-3)}` : undefined,
      actApprovedDate: hasAct ? D(g.SG3) : undefined,
      approvedBudget: hasAct ? s.cost : undefined,
      pi: Math.round((s.benefit / s.cost) * 100) / 100,
      costCenter: hasAct ? `CC-${300000 + Number(s.code.slice(-3)) * 17}` : undefined,
      glCode: hasAct ? '640100' : undefined,
      wbsElements: hasAct && s.wbs ? [`ZB-${s.code.slice(-3)}-01`] : [],
      poNumbers: hasAct && s.wbs ? [`45000${s.code.slice(-3)}12`] : [],
      drbRequired: !!s.drb,
      crbRequired: !!s.crb,
      cabRequired: !!s.cab,
      governanceDrivers: [s.drb ? 'Architecture impact' : '', s.crb ? 'Cross-functional impact' : '', s.itgc ? 'Compliance' : '', s.cab ? 'Operations' : ''].filter(Boolean),
      healthScope: health?.[0],
      healthSchedule: health?.[1],
      healthResource: health?.[2],
      healthBudget: health?.[3],
      healthOverall: health ? overallHealth({ scope: health[0], schedule: health[1], resource: health[2], budget: health[3] }) : undefined,
      healthAsOf: health ? D(s.code.endsWith('003') ? -12 : -2) : undefined,
      actualGoLiveDate: si >= 6 ? D(s.golive) : undefined,
      closedDate: si >= 8 ? D(s.golive + 60) : undefined,
      lessonsLearned: si >= 7 ? 'Engage integration team earlier; reserve UAT testers from the business before Plan approval.' : undefined,
      ndaActive: !!s.codename,
      ndaConverted: false,
      ndaCodename: s.codename,
      ndaRationale: s.codename ? 'Acquisition is covered by a mutual NDA until public announcement; disclosure limited to the deal team.' : undefined,
      ndaDesignatedById: s.codename ? P.pmodir.id : undefined,
      ndaDesignatedAt: s.codename ? T(s.start - 5) : undefined,
      ndaLastReviewedAt: s.codename ? T(-20) : undefined,
      restrictedArtifacts: [],
      artifactsInitializedAt: si >= 1 ? T(g.SG0) : undefined,
      demo: true,
    };
    projects[s.code] = p;
    out.projects.push(p);
    audit(p.createdAt!, P[s.brm], 'INTAKE_CREATED', id, `Draft intake ${s.code} created`);
    if (p.readyForReviewAt) audit(p.readyForReviewAt, P[s.brm], 'READY_FOR_REVIEW', id, 'Intake marked Ready for Review');
    if (s.codename) {
      audit(p.ndaDesignatedAt!, P.pmodir, 'NDA_DESIGNATED', id, `Designated confidential NDA project (${s.codename})`);
      for (const k of ndaList) out.ndaAccess.push({ id: uuid(), projectId: id, userId: P[k].id, designee: k === 'pmodir', addedById: P.pmodir.id, addedAt: p.ndaDesignatedAt, lastRecertifiedAt: T(-20) });
    }

    if (si === 0) continue; // Draft intakes have no artifacts yet
    const rec = (extra: Record<string, any>, createdOff = g.SG0): Rec => ({ id: uuid(), projectId: id, createdAt: T(Math.min(createdOff, -1)), createdBy: P[s.pm ?? s.brm].id, updatedAt: T(Math.min(createdOff + 3, -1)), updatedBy: P[s.pm ?? s.brm].id, ...extra });

    // 0.0 Stakeholders
    const sh: [string, PersonaKey | undefined, string?][] = [['BRM', s.brm, 'PPM Intake'], ['Project Sponsor', s.sponsor], ['Project Manager', s.pm], ['Business Analyst', s.ba], ['IT Delivery Lead', s.pillar === 'Infrastructure' || s.pillar === 'Cyber Security' ? 'pillar2' : 'pillar1'], ['Technical Lead', 'arch'], ['Business SME', 'sme']];
    sh.forEach(([role, k, src]) => k && out.stakeholders.push(rec({ role, name: P[k].name, email: P[k].email, company: P[k].external ? 'External' : BRAND.company, steerCo: ['Project Sponsor', 'BRM', 'IT Delivery Lead'].includes(role), sourceInput: src ?? 'Stakeholder Register' })));
    if (s.codename) out.stakeholders.push(rec({ role: 'Implementation Partner', name: P.ext2.name, email: P.ext2.email, company: 'Litware ERP Partners', steerCo: false, sourceInput: 'Stakeholder Register', notes: 'Under NDA' }));

    // 0.0b RACI
    RACI_DELIVERABLES.forEach(([deliverable, raci], i) => out.raci.push(rec({ deliverable, order: i, ...raci })));

    // 1.0 BRD requirements (hierarchical)
    const reqIds: string[] = [];
    let order = 0;
    for (const [group, reqType, items] of REQS) {
      const gid = uuid();
      out.requirements.push(rec({ id: gid, title: group, reqType, priority: 'Must Have', status: si >= 6 ? 'Verified' : si >= 5 ? 'In Progress' : 'Proposed', approvalState: si >= 3 ? 'Approved' : 'Pending', order: order++, source: 'Requirements workshop' }));
      items.forEach((title, i) => {
        const rid = uuid();
        reqIds.push(rid);
        out.requirements.push(rec({ id: rid, parentId: gid, title: i === 0 && reqType === 'Business' ? `${title}: ${s.outcome}` : title, reqType, priority: i === items.length - 1 && reqType !== 'Business' ? 'Should Have' : 'Must Have', status: si >= 6 ? 'Verified' : si >= 5 ? 'Implemented' : 'Proposed', approvalState: si >= 3 || (si === 2 && i < 2) ? 'Approved' : 'Pending', owner: P[s.ba ?? s.brm].id, order: i, source: 'Requirements workshop', acceptanceCriteria: 'Verified in UAT with business sign-off.' }));
      });
    }

    // 2.0 Project plan from the WBS template
    const span = s.golive - s.exec;
    const phaseWindow: Record<string, [number, number]> = {
      Initiate: [s.start, g.SG1],
      Plan: [g.SG1, g.SG3],
      'Execute Kickoff': [s.exec, s.exec + 2],
      'Detailed Design': [s.exec + 2, s.exec + 0.2 * span],
      'Design Review Board': [s.exec + 0.2 * span, s.exec + 0.25 * span],
      Build: [s.exec + 0.25 * span, s.exec + 0.55 * span],
      'System Integration Testing': [s.exec + 0.55 * span, s.exec + 0.7 * span],
      'User Acceptance Test': [s.exec + 0.7 * span, s.exec + 0.86 * span],
      'Go / No-Go': [g.GNG, g.GNG],
      Cutover: [s.exec + 0.88 * span, s.golive - 1],
      'Go-Live': [s.golive, s.golive],
      Hypercare: [s.golive, s.golive + 30],
      Close: [s.golive + 30, s.golive + 45],
    };
    const slip = s.health?.[1] === 'Yellow' ? 8 : s.health?.[1] === 'Red' ? 20 : 0;
    PLAN_TEMPLATE.forEach((ph, pi) => {
      const [a, b] = phaseWindow[ph.phase];
      const phaseId = uuid();
      const shift = slip && a > 0 ? slip : 0;
      const status = (end: number, start: number) =>
        si >= 7 || end + shift < -1 ? 'Complete' : start + shift <= 0 ? 'In Progress' : 'Not Started';
      out.tasks.push(rec({ id: phaseId, name: ph.phase, taskType: 'Phase', order: pi, start: D(a + shift), end: D(b + shift), baselineStart: D(a), baselineEnd: D(b), status: status(b, a), pctComplete: status(b, a) === 'Complete' ? 100 : status(b, a) === 'In Progress' ? 40 : 0 }));
      ph.tasks.forEach((t, ti) => {
        const ta = a + ((b - a) * ti) / Math.max(1, ph.tasks.length);
        const tb = t.type ? ta : a + ((b - a) * (ti + 1)) / Math.max(1, ph.tasks.length);
        const st = status(tb, ta);
        const notRequired = ph.phase === 'Plan' && t.name.startsWith('Review Disaster') && s.pillar === 'Software Engineering';
        out.tasks.push(rec({ parentId: phaseId, name: t.name, taskType: t.type ?? 'Task', order: ti, start: D(ta + shift), end: D(tb + shift), baselineStart: D(ta), baselineEnd: D(tb), status: notRequired ? 'Not Required' : st, pctComplete: st === 'Complete' ? 100 : st === 'In Progress' ? 50 : 0, assigneeId: P[s.pm ?? s.brm].id, effortHours: t.type ? 0 : 16 }));
      });
    });

    // 3.0 Resource demand
    s.teams.forEach((t, i) => {
      const team = TEAMS.find((x) => x[0] === t)!;
      const res = teamResources[t] || [];
      let status: string = 'Requested';
      if (si >= 4) status = 'Confirmed';
      else if (si === 3) status = s.code.endsWith('003') && i === 1 ? 'Gap' : 'Confirmed';
      else if (si === 2) status = ['Confirmed', 'Nominated', 'Requested'][i % 3];
      const hours = Math.round(((s.cost / 140) * (i === 0 ? 0.13 : 0.078)) / 10) * 10; // most effort sits with vendors; this is internal team demand
      const nominated = ['Nominated', 'Confirmed'].includes(status) ? res[i % Math.max(1, res.length)] : undefined;
      out.demands.push(rec({
        placeholder: `${team[2]} ${['Lead', 'Developer', 'Analyst'][i % 3]}${nominated ? '' : ' (TBD)'}`,
        category: team[2] === 'Insights & Analytics' ? 'Insights' : team[2],
        specialty: t === 'ba' ? 'Business Analyst' : t === 'infra' ? 'Infrastructure Engineer' : t === 'cyber' ? 'Security Analyst' : t === 'data' ? 'Data Engineer' : i === 0 ? 'Functional Consultant' : 'Developer',
        teamId: TEAM[t],
        resourceType: i === 1 && s.cost > 700000 ? 'External' : 'Internal',
        expenseCategory: s.pillar === 'Infrastructure' ? 'Capital' : 'Expense',
        startDate: D(s.exec),
        endDate: D(s.golive),
        hours,
        rate: i === 1 && s.cost > 700000 ? 145 : 85,
        status,
        nominatedResourceId: nominated,
        nominatedHours: nominated ? hours : undefined,
        nominatedById: nominated ? team[3] && P[team[3]].id : undefined,
        nominatedAt: nominated ? T(g.SG1 + 5) : undefined,
        decidedById: status === 'Confirmed' ? P[s.pm ?? s.brm].id : undefined,
        decidedAt: status === 'Confirmed' ? T(g.SG1 + 9) : undefined,
        escalated: status === 'Gap',
        notes: status === 'Gap' ? 'No Cyber analyst capacity in Q1 – exploring contractor.' : undefined,
      }, g.SG1));
    });

    // 3.5 Budget & forecast (lines + monthly entries) and SAP actuals
    const months = monthRange(ym(D(s.exec)), Math.max(2, Math.round((s.golive - s.exec) / 30) + 2));
    const factor = s.forecastFactor ?? 1;
    const lines: [string, string, string, number][] = [
      ['Internal labor', 'Expense', 'Internal Labor', 0.35],
      ['Implementation partner', s.pillar === 'Infrastructure' ? 'Capital' : 'Expense', s.pillar === 'Infrastructure' ? 'Hardware' : 'External Labor', 0.5],
      ['Software / licenses', 'Capital', 'Software / Licenses', 0.1],
      ['Contingency (5%)', 'Expense', 'Contingency', 0.05],
    ];
    for (const [desc, cat, spend, share] of lines) {
      const lineId = uuid();
      out.forecastLines.push(rec({ id: lineId, description: desc, category: cat, spendCategory: spend, approvedBudget: hasAct ? Math.round(s.cost * share) : 0, wbsElement: p.wbsElements[0], poNumber: spend === 'External Labor' && hasAct ? p.poNumbers[0] : undefined }, g.SG1));
      const per = (s.cost * share * factor) / months.length;
      months.forEach((m) => out.forecastEntries.push({ id: uuid(), projectId: id, lineId, period: m, amount: Math.round(per), createdAt: T(Math.min(g.SG1, -1)), updatedAt: T(si >= 5 ? -12 : Math.min(g.SG1 + 4, -1)) }));
      if (si >= 5 && p.wbsElements[0]) {
        months.filter((m) => m < ym(today)).forEach((m, i) =>
          out.actuals.push({ id: uuid(), projectId: id, wbsElement: p.wbsElements[0], period: m, category: cat, amount: Math.round(per * (0.9 + ((i * 7) % 15) / 100)), docRef: `51000${s.code.slice(-3)}${i}`, importedAt: T(-3, 6) }),
        );
      }
    }

    // 4.0 Cost estimator (CAPEX / OPEX trees)
    for (const [ri, root] of (['CAPEX', 'OPEX'] as const).entries()) {
      const rootId = uuid();
      out.costItems.push(rec({ id: rootId, itCategory: root === 'CAPEX' ? 'CAPITAL' : 'EXPENSE', expenseCategory: root, order: ri }));
      COST_TEMPLATE.forEach((area, ai) => {
        const areaId = uuid();
        out.costItems.push(rec({ id: areaId, parentId: rootId, itCategory: area.area, expenseCategory: root, order: ai }));
        area.items.forEach((item, ii) =>
          out.costItems.push(rec({ parentId: areaId, itCategory: item, expenseCategory: root, order: ii, qty: area.area === s.pillar.split(' ')[0] && ii === 0 ? (root === 'CAPEX' ? 1 : 12) : undefined, unitCost: area.area === s.pillar.split(' ')[0] && ii === 0 ? Math.round((root === 'CAPEX' ? s.cost * 0.2 : (s.cost * 0.05) / 12) / 100) * 100 : undefined, unitOfMeasure: root === 'CAPEX' ? 'Lot' : 'Month' })),
        );
        out.costItems.push(rec({ parentId: areaId, itCategory: `${area.area} Internal Labor`, expenseCategory: root, laborRow: 'Internal Labor', order: 90, unitOfMeasure: 'Labor Hour / USD', qty: area.area === 'PMO' && root === 'OPEX' ? Math.round(s.cost / 400) : undefined, unitCost: area.area === 'PMO' && root === 'OPEX' ? 85 : undefined }));
      });
    }

    // 5.0 RAIDD
    const raidd: [string, string, string, string, number, Partial<Rec>][] = [
      ['Risk', 'Key business SMEs unavailable during UAT window', '2-High', 'Open', 30, { execReporting: s.code.endsWith('001'), escalated: s.code.endsWith('001'), askToLeadership: s.code.endsWith('001') ? 'Confirm backfill for two Finance SMEs during UAT.' : undefined }],
      ['Assumption', 'Existing SAP authorizations can be reused for new roles', '4-Low', si >= 5 ? 'Closed' : 'Open', 10, {}],
      ['Dependency', 'Mulesoft platform upgrade completes before integration build', '3-Medium', si >= 6 ? 'Closed' : 'Open', 20, {}],
      ['Decision', 'Phase rollout by region vs. big-bang go-live', '2-High', si >= 4 ? 'Closed' : 'Open', 15, { resolution: si >= 4 ? 'Phased rollout approved by SteerCo.' : undefined }],
    ];
    if (s.code.endsWith('003')) raidd.push(['Issue', 'No Cyber analyst capacity for firewall cutover in Q1', '2-High', 'Open', 7, { execReporting: true, escalated: true, askToLeadership: 'Approve contractor budget for 320 hours.' }]);
    if (s.code.endsWith('002')) raidd.push(['Change Request', 'Add warranty claim submission to Release 1 scope', '3-Medium', 'Open', 12, { execReporting: true }]);
    const prefixCount: Record<string, number> = {};
    raidd.forEach(([type, title, sev, status, due, extra]) => {
      const n = (prefixCount[type] = (prefixCount[type] || 0) + 1);
      out.raidd.push(rec({ raiddId: `${RAIDD_PREFIX[type]}-${String(n).padStart(3, '0')}`, type, title, severity: sev, priority: sev, status, assigneeId: P[s.pm ?? s.brm].id, dueDate: D(due), impact: 'Could delay milestones or reduce benefits if not addressed.', mitigation: 'Tracked weekly in project status; escalate through SteerCo if unresolved.', closedAt: status === 'Closed' ? T(-20) : undefined, ...extra }, g.SG1));
    });

    // 6.0 UAT test plan + traceability, 6.0b defects
    if (si >= 5) {
      const results = si >= 6 ? ['Passed', 'Passed', 'Passed', 'Passed', 'Passed'] : ['Passed', 'Passed', 'Failed', 'Not Run', 'Not Run'];
      const titles = ['End-to-end happy path', 'Approval workflow and notifications', 'Data validation on submission', 'Role-based access', 'Reporting outputs'];
      const tcIds: string[] = [];
      titles.forEach((title, i) => {
        const tid = uuid();
        tcIds.push(tid);
        out.testCases.push(rec({ id: tid, ref: `TC-${String(i + 1).padStart(3, '0')}`, title, category: 'UAT', importance: i < 2 ? 'Critical' : 'High', assigneeId: P.sme.id, result: results[i], testedDate: results[i] === 'Not Run' ? undefined : D(-6 + i), expectedResults: 'Process completes and data posts correctly.' }, s.exec + 0.65 * span));
        [reqIds[(i * 2) % reqIds.length], reqIds[(i * 2 + 1) % reqIds.length]].forEach((rid) => out.traces.push({ id: uuid(), projectId: id, testCaseId: tid, requirementId: rid }));
      });
      if (si === 5) {
        out.uatDefects.push(rec({ defectNo: 'UAT-001', title: 'Validation message missing for blank cost center', testCaseId: tcIds[2], priority: 'P2 - High', status: 'In Progress', assigneeId: person('Hector Silva'), defectType: 'Code', module: 'Validation' }, -8));
        out.uatDefects.push(rec({ defectNo: 'UAT-002', title: 'Report column header misspelled', testCaseId: tcIds[4], priority: 'P4 - Low', status: 'Closed', assigneeId: person('Alex Moreno'), defectType: 'Configuration', resolution: 'Corrected label', dateFixed: D(-3) }, -9));
      } else {
        out.uatDefects.push(rec({ defectNo: 'UAT-001', title: 'Approval email missing approver name', testCaseId: tcIds[1], priority: 'P3 - Medium', status: 'Closed', assigneeId: person('Hector Silva'), defectType: 'Configuration', resolution: 'Template fixed', dateFixed: D(s.golive - 20) }, s.golive - 25));
      }
    }

    // 7.0 Cutover & 8.0 Hypercare
    if (si >= 5 && (si >= 6 || s.golive < 60)) {
      const cut: [string, string, string][] = [
        ['Pre-Cutover', 'Freeze configuration changes', 'Technical'],
        ['Pre-Cutover', 'Deploy release to production', 'Technical'],
        ['Pre-Cutover', 'Master data preparation', 'Data'],
        ['Cutover Execution', 'Data migration load', 'Data'],
        ['Cutover Execution', 'Smoke test in production', 'Validation'],
        ['Cutover Execution', 'Business validation sign-off', 'Business'],
        ['Post-Cutover', 'Hypercare kickoff communication', 'Communication'],
        ['Rollback', 'Rollback plan validated', 'Technical'],
      ];
      cut.forEach(([focusArea, taskName, taskType], i) =>
        out.cutoverTasks.push(rec({ taskId: `CO-${String(i + 1).padStart(3, '0')}`, focusArea, taskName, taskType, assigneeId: person(i % 2 ? 'Hector Silva' : 'Alex Moreno'), status: si >= 6 ? 'Complete' : 'Not Started', start: `${D(s.golive - 3 + Math.floor(i / 3))}T${String(8 + (i % 3) * 3).padStart(2, '0')}:00`, end: `${D(s.golive - 3 + Math.floor(i / 3))}T${String(10 + (i % 3) * 3).padStart(2, '0')}:00` }, s.golive - 20)),
      );
    }
    if (si >= 6) {
      const open = s.stage === 'Go-Live / Hypercare';
      out.hypercareDefects.push(rec({ defectNo: 'HC-001', title: 'RF scanner timeout in aisle 14', reportedBy: P.sme.name, reportedByEmail: P.sme.email, application: 'Manhattan WMS', priority: 'P2 - High', status: open ? 'In Progress' : 'Closed', assigneeId: person('Deepa Iyer'), dateFixed: open ? undefined : D(s.golive + 6) }, s.golive + 2));
      out.hypercareDefects.push(rec({ defectNo: 'HC-002', title: 'Pick list prints twice', reportedBy: P.sme.name, application: 'Manhattan WMS', priority: 'P3 - Medium', status: open ? 'Open' : 'Closed', assigneeId: person('Ethan Park'), dateFixed: open ? undefined : D(s.golive + 9) }, s.golive + 4));
      out.hypercareDefects.push(rec({ defectNo: 'HC-003', title: 'Label printer driver on DC2', reportedBy: P.sme.name, application: 'Manhattan WMS', priority: 'P4 - Low', status: 'Closed', assigneeId: person('Liam Foster'), dateFixed: D(Math.min(s.golive + 5, -1)) }, s.golive + 1));
    }

    // 9.0 Weekly status
    if (si >= 2 && s.health) {
      const lastFriday = (() => {
        const d = new Date(today + 'T00:00:00Z');
        while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
        return Math.round((d.getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86400000);
      })();
      const endOff = si >= 7 ? Math.min(s.golive + 40, lastFriday) : s.code.endsWith('003') ? lastFriday - 7 : lastFriday;
      for (let w = 5; w >= 0; w--) {
        const off = endOff - w * 7;
        if (off < s.start + 20) continue;
        const h = w === 0 ? s.health : (['Green', 'Green', 'Green', 'Green'] as Health[]);
        out.statusUpdates.push(rec({
          statusDate: D(off),
          scope: h[0], schedule: h[1], resource: h[2], budget: h[3],
          overall: overallHealth({ scope: h[0], schedule: h[1], resource: h[2], budget: h[3] }),
          executiveSummary: w === 0 && h.some((x) => x !== 'Green') ? `${s.stage} on track overall; ${h[1] !== 'Green' ? 'build/SIT forecast 8 days late but recoverable before Go/No-Go' : h[2] !== 'Green' ? 'resource gap open for one team' : 'forecast trending above budget'}.` : `${s.stage} progressing to plan.`,
          accomplishments: 'Completed planned tasks for the period; SteerCo held.',
          nextSteps: 'Continue next phase activities per plan.',
          risks: h[2] !== 'Green' ? 'Capacity gap for key role.' : undefined,
          helpNeeded: h.some((x) => x !== 'Green') ? 'See escalated RAIDD items.' : undefined,
          pathToGreen: h.some((x) => x !== 'Green') ? 'Recovery plan reviewed weekly with PMO.' : undefined,
        }, off));
      }
    }

    // Governance decisions (X.0b Approvals)
    const decide = (gate: keyof typeof g, approver: PersonaKey, decision = 'Approve', extra: Record<string, any> = {}) => {
      const at = T(clampPast(g[gate]), 16);
      const review = { id: uuid(), projectId: id, gate, status: 'Decided', requestedById: P[gate === 'SG0' ? s.brm : s.pm ?? s.brm].id, requestedAt: T(clampPast(g[gate] - 3), 10), decision, decidedById: P[approver].id, decidedAt: at, comments: decision === 'Approve' ? 'Criteria met.' : 'Approved with documented exception.', failedChecks: [], ...extra };
      out.gateReviews.push(review);
      audit(at, P[approver], 'GATE_DECISION', id, `${gate}: ${decision}`, 'Gate Review');
      return review;
    };
    if (passed('SG0')) decide('SG0', 'pmodir');
    if (passed('SG1')) decide('SG1', 'pillar1');
    if (passed('SG2')) {
      if (s.code.endsWith('001')) {
        const exId = uuid();
        out.exceptions.push({ id: exId, projectId: id, context: 'SG2', items: ['resourceFeasibility'], justification: 'Integration developer nomination pending vendor SOW; PMO accepts risk with re-check at SG3.', approvedById: P.pmodir.id, approvedAt: T(clampPast(g.SG2), 16) });
        decide('SG2', 'pmodir', 'Approve with Exception', { failedChecks: ['resourceFeasibility'], exceptionId: exId, conditions: 'Confirm integration developer before SG3.' });
      } else decide('SG2', 'pillar1');
    }
    if (passed('SG3')) decide('SG3', 'fin');
    if (passed('DRB')) decide('DRB', 'arch');
    if (passed('CRB')) decide('CRB', 'pillar1');
    if (passed('GNG')) decide('GNG', 'pmodir');
    if (passed('CAB')) decide('CAB', 'pillar2');
  }

  // Pending reviews & approvals inbox content
  const pr = (code: string) => projects[code];
  out.gateReviews.push({ id: uuid(), projectId: pr('ITProj-26-005').id, gate: 'SG0', status: 'Pending', requestedById: P.brm2.id, requestedAt: pr('ITProj-26-005').readyForReviewAt, requestNotes: 'Ready for PMO review.', failedChecks: [] });
  out.gateReviews.push({ id: uuid(), projectId: pr('ITProj-26-002').id, gate: 'SG2', status: 'Pending', requestedById: P.pm2.id, requestedAt: T(-2, 11), requestNotes: 'Requesting ACT readiness review; two nominations still open.', failedChecks: [] });
  out.gateReviews.push({ id: uuid(), projectId: pr('ITProj-26-001').id, gate: 'GNG', status: 'Pending', requestedById: P.pm1.id, requestedAt: T(-1, 9), requestNotes: 'Go/No-Go for cutover weekend; UAT completing this week.', failedChecks: [] });

  // External access grants
  const grant = (code: string, who: User | { name: string; email: string }, scope: 'workspace' | 'artifact', keys: string[], permission: 'View' | 'Edit', expiresOff: number, status: string, extra: Record<string, any> = {}) =>
    out.accessGrants.push({ id: uuid(), projectId: pr(code).id, email: who.email, name: who.name, userId: (who as User).id, scope, artifactKeys: keys, permission, expiresAt: D(expiresOff), status, justification: 'Implementation partner needs access to collaborate on delivery artifacts.', requestedById: pr(code).pmId, requestedAt: T(-40), sponsorApprovedById: status !== 'Pending Sponsor' ? pr(code).sponsorId : undefined, sponsorApprovedAt: status !== 'Pending Sponsor' ? T(-39) : undefined, adminApprovedById: ['Active', 'Expired'].includes(status) ? P.admin.id : undefined, adminApprovedAt: ['Active', 'Expired'].includes(status) ? T(-38) : undefined, ...extra });
  grant('ITProj-26-008', P.ext1, 'workspace', [], 'View', 5, 'Active');
  grant('ITProj-26-001', P.ext1, 'artifact', ['uatPlan', 'uatDefects', 'cutover'], 'Edit', 60, 'Active');
  grant('ITProj-26-007', { name: 'Mei Tanaka', email: 'mei.tanaka@lucerne-design.example' }, 'artifact', ['brd', 'plan'], 'View', 90, 'Pending Sponsor', { requestedById: P.pm2.id, requestedAt: T(-1) });
  grant('ITProj-26-009', P.ext1, 'artifact', ['hypercare'], 'Edit', -15, 'Expired', { closedAt: T(-15, 0), closeReason: 'Expired automatically' });

  // Notifications
  notify(P.pmodir, pr('ITProj-26-005').id, 'intake', 'Intake ready for review: Workday Recruiting Integration', 'Priya Natarajan marked ITProj-26-005 Ready for Review.', `/projects/ITProj-26-005/governance`, -3);
  notify(P.pmoadm, pr('ITProj-26-005').id, 'intake', 'Intake ready for review: Workday Recruiting Integration', 'Priya Natarajan marked ITProj-26-005 Ready for Review.', `/projects/ITProj-26-005/governance`, -3);
  for (const k of ['pmodir', 'pillar1', 'pillar2'] as PersonaKey[]) notify(P[k], pr('ITProj-26-001').id, 'gate', 'Go/No-Go review pending: SAP S/4HANA Finance Close Automation', 'Jordan Blake requested a Go/No-Go decision.', `/projects/ITProj-26-001/governance`, -1);
  notify(P.rtm1, pr('ITProj-26-002').id, 'nomination', 'Resource request pending: Dealer Portal Modernization', 'A demand line for Apps - Sales & Order Management needs a nomination.', `/resources?tab=nominations`, -4);
  notify(P.pm2, pr('ITProj-26-002').id, 'nomination', 'Nomination ready for confirmation', 'Nina Petrova nominated a resource for SW Eng. - Integration (Mulesoft).', `/projects/ITProj-26-002/resources`, -2);
  notify(P.pm1, pr('ITProj-26-003').id, 'reminder', 'Weekly status overdue: Plant Network Refresh – North America', 'The last status update is more than 7 days old.', `/projects/ITProj-26-003/status`, -1);
  notify(P.sponsor2, pr('ITProj-26-007').id, 'access', 'External access request awaiting your approval', 'Aisha Rahman requested View access for mei.tanaka@lucerne-design.example.', `/approvals`, -1);
  notify(P.ext1, pr('ITProj-26-008').id, 'access', 'Your access expires in 5 days', 'Access to ITProj-26-008 expires soon. Ask the project owner to renew if needed.', `/projects/ITProj-26-008`, 0);

  // Scenarios
  out.scenarios.push({ id: uuid(), name: 'Delay Dealer Portal by 2 months', description: 'What if Dealer Portal execution starts 2 months later to relieve Web & Mobile?', createdById: P.pmodir.id, includeProposed: true, shifts: { [pr('ITProj-26-002').id]: 2 }, capacityAdjust: {}, excluded: [] });
  out.scenarios.push({ id: uuid(), name: 'Add contractors to SAP Finance', description: 'Increase SAP Finance capacity by 25% with staff augmentation.', createdById: P.rtm1.id, includeProposed: true, shifts: {}, capacityAdjust: { [TEAM.sapfin]: 25 }, excluded: [] });

  return out;
}
