/**
 * The demo script as data for the live page's presenter guide.
 * docs/demo-script.md is the same script for reading ahead of a demo: keep the two in step.
 */
import type { Stage } from '../src/domain/types';

/** Where to point the audience after a jump. */
export type Spot =
  /** The first card whose title starts with one of these texts. */
  | { card: string | string[] }
  /** The table row that contains this text. `{new}` is the project created during the demo; `or` is tried next. */
  | { row: string; or?: string }
  /** The first card on the screen. */
  | { first: true };

export interface Jump {
  /** Sample person to act as: the part of their email before the @. */
  as: string;
  /** Screen in the app, as a route. `{new}` stands for the project created during the demo. */
  route: string;
  /** What the button opens, in the words the audience sees on screen. */
  screen: string;
  /** Route to open instead when `{new}` has no project yet, or the project has not reached `minStage`. */
  fallback?: string;
  minStage?: Stage;
  spot?: Spot;
}

export type HelperId = 'fill-intake' | 'break-dates' | 'fix-dates';

export interface Step {
  id: string;
  title: string;
  /** Phase heading in the full walkthrough. */
  phase?: string;
  /** Talk track. */
  say?: string;
  /** How the work happened in Smartsheet. */
  before?: string;
  /** How it happens now. */
  now?: string;
  /** Points to make. */
  points?: string[];
  /** What to do on screen. */
  show?: string;
  jumps?: Jump[];
  helpers?: { id: HelperId; label: string }[];
  /** Continues on the screen the previous step left open, so arriving at this step opens nothing. */
  stay?: boolean;
  /** Shows the closing numbers. */
  numbers?: boolean;
}

export interface Run {
  id: 'quick' | 'full' | 'topics';
  tab: string;
  title: string;
  intro: string;
  /** Steps are a sequence, so they are numbered. Topics are not. */
  numbered: boolean;
  /** Target length, for the timer. */
  minutes?: number;
  steps: Step[];
}

const P1 = '/projects/ITProj-26-001';
const INITIATE_SAMPLE = '/projects/ITProj-26-007';

export const RUNS: Run[] = [
  {
    id: 'quick',
    tab: '15 min',
    title: 'The 15-minute version',
    intro: 'Six beats: the problem, governance, decisions, capacity, the portfolio and the close.',
    numbered: true,
    minutes: 15,
    steps: [
      {
        id: 'q1',
        title: 'The problem, in one slide',
        say: 'Every project used to be a Smartsheet workspace of 16 copied sheets. The same 16 artifacts are now rows in Dataverse tables under one project record.',
        jumps: [{ as: 'jordan.blake', route: `${P1}/overview`, screen: 'Project artifacts', spot: { card: 'Project artifacts' } }],
      },
      {
        id: 'q2',
        title: 'Governance that enforces itself',
        say: "Each gate shows its readiness checks against the project's own data. Go/No-Go is pending with open checks.",
        jumps: [{ as: 'jordan.blake', route: `${P1}/governance`, screen: 'Governance', spot: { card: 'Stage gates & governance reviews' } }],
      },
      {
        id: 'q3',
        title: 'One inbox for decisions',
        say: 'Choose Decide on the Workday Recruiting Integration intake and approve Stage Gate 0. The project moves to Initiate and its artifacts are created.',
        jumps: [{ as: 'elena.vasquez', route: '/approvals', screen: 'My approvals', spot: { row: 'Workday Recruiting Integration' } }],
      },
      {
        id: 'q4',
        title: 'Capacity in the same tool',
        say: 'The heatmap shows demand against capacity by team and month. Select a cell to see the projects behind it.',
        jumps: [{ as: 'marcus.webb', route: '/resources', screen: 'Capacity heatmap', spot: { card: 'Team utilization' } }],
      },
      {
        id: 'q5',
        title: 'The portfolio view',
        say: 'The CIO sees stage, health, budget against forecast and actuals, and upcoming go-lives. Point out that the confidential acquisition project is not there.',
        jumps: [{ as: 'victoria.hale', route: '/', screen: 'Portfolio overview' }],
      },
      {
        id: 'q6',
        title: 'Close',
        say: "The same app runs in Microsoft Teams, and the data sits in the customer's own Dataverse environment.",
        stay: true,
        numbers: true,
      },
    ],
  },
  {
    id: 'full',
    tab: 'Full',
    title: 'The full walkthrough',
    intro: 'From a new idea to an archived project. The project you create in step 1 gets the next Project ID. Later steps use sample projects that are already at those stages.',
    numbered: true,
    steps: [
      {
        id: 'f1',
        phase: 'Intake and approval',
        title: 'A BRM opens a new intake',
        before: "Requests went into the PPM Intake sheet, and its fields were later copied into each project's metadata sheet.",
        now: 'Only BRMs see New Intake. One form captures the objective, benefits, cost, roadmap alignment, business, function, priority, Agile and ITGC flags, dates and uploads.',
        show: 'Fill in a project, for example a Supplier Self-Service Portal, and choose Save draft. The intake stays in Draft until the BRM submits it.',
        jumps: [{ as: 'priya.natarajan', route: '/intake/new', screen: 'New intake', spot: { card: 'Project basics' } }],
        helpers: [{ id: 'fill-intake', label: 'Fill in the Supplier Self-Service Portal' }],
      },
      {
        id: 'f2',
        phase: 'Intake and approval',
        title: 'Validation and a unique Project ID',
        before: 'The ITProj-YY-NNN ID and the project type were assigned on the intake sheet.',
        now: 'Required fields are checked before submit. Initiate must come before execution and go-live, and the form says why it blocks a save. The project gets the Draft stage and the next ID in the same format.',
        show: 'Set the execution date before the initiate date and choose Save & mark Ready for Review. The form says what blocks it. Then fix the dates.',
        stay: true,
        jumps: [{ as: 'priya.natarajan', route: '/projects/{new}/overview', fallback: '/intake/new', screen: 'Your draft intake', spot: { card: 'Planned dates' } }],
        helpers: [
          { id: 'break-dates', label: 'Put execution before initiate' },
          { id: 'fix-dates', label: 'Fix the dates' },
        ],
      },
      {
        id: 'f3',
        phase: 'Intake and approval',
        title: 'Ready for Review notifies the PMO',
        before: 'Progress was tracked in a Workflow Status column.',
        now: 'Save & mark Ready for Review locks editing for the BRM, who can recall it until a decision. The PMO Director and PMO Program Administrator are notified, and a Stage Gate 0 review opens.',
        show: 'Choose Save & mark Ready for Review. Then switch to Elena: the bell icon shows the notification, and the review is in her approvals inbox.',
        stay: true,
        jumps: [{ as: 'elena.vasquez', route: '/approvals', screen: "Elena's approvals inbox", spot: { row: '{new}', or: 'Workday Recruiting Integration' } }],
      },
      {
        id: 'f4',
        phase: 'Intake and approval',
        title: 'The Stage Gate 0 decision',
        before: 'Decisions were rows on the Approvals sheet: area, decision, notes and date.',
        now: "My Approvals lists every pending gate with its readiness. The outcomes are Approve, Approve with Exception, Rework, Hold and Stop. The requester and the project's own BRM or PM cannot approve. Each decision records the approver, outcome, time, comments and conditions.",
        show: 'Choose Decide on the new intake and approve it.',
        jumps: [{ as: 'elena.vasquez', route: '/approvals', screen: 'My approvals', spot: { row: '{new}', or: 'Workday Recruiting Integration' } }],
      },
      {
        id: 'f5',
        phase: 'Initiate',
        title: 'Artifacts are created in Dataverse',
        before: 'Approval to Initiate copied the templates into a new workspace of 16 sheets and a dashboard folder.',
        now: 'Approval moves the project to Initiate and records the approval date. The same 16 artifacts are created as Dataverse rows under the project, numbered as before.',
        show: 'The Project artifacts card. Each artifact shows its table, update cadence, row count, last update and access.',
        jumps: [{ as: 'elena.vasquez', route: '/projects/{new}/overview', fallback: `${INITIATE_SAMPLE}/overview`, minStage: 'Initiate', screen: 'Project artifacts', spot: { card: 'Project artifacts' } }],
      },
      {
        id: 'f6',
        phase: 'Initiate',
        title: 'Assign the team and stakeholders',
        before: 'The Stakeholder Register and RACI sheets repeated the Project ID and name on every row.',
        now: 'The PMO assigns the PM, sponsor, BA, IT delivery lead and technical lead with a people picker. The stakeholder register and RACI are pre-filled from the template.',
        show: 'Choose Edit on the project record and set the PM and sponsor. Make Aisha Rahman the PM, for Stage Gate 1 in step 8. Then open Stakeholders & RACI.',
        jumps: [
          { as: 'elena.vasquez', route: '/projects/{new}/overview', fallback: `${INITIATE_SAMPLE}/overview`, minStage: 'Initiate', screen: 'Project record', spot: { card: 'Project record' } },
          { as: 'elena.vasquez', route: '/projects/{new}/people', fallback: `${INITIATE_SAMPLE}/people`, minStage: 'Initiate', screen: 'Stakeholders & RACI', spot: { first: true } },
        ],
      },
      {
        id: 'f7',
        phase: 'Initiate',
        title: 'Draft the plan, estimates and RAIDD',
        before: 'Three separate sheets for the Project Plan, Resource Estimator and RAIDD Log.',
        now: 'A WBS plan generated from the standard template, with baseline and forecast dates and overdue flags. Resource demand by labor area, specialty, team, dates and hours. RAIDD covers risks, actions, issues, decisions, dependencies, assumptions and change requests, with automatic IDs.',
        show: 'The Plan, Resources and RAIDD tabs.',
        jumps: [
          { as: 'jordan.blake', route: `${P1}/plan`, screen: 'Plan', spot: { first: true } },
          { as: 'jordan.blake', route: `${P1}/resources`, screen: 'Resources', spot: { first: true } },
          { as: 'jordan.blake', route: `${P1}/raidd`, screen: 'RAIDD', spot: { first: true } },
        ],
      },
      {
        id: 'f8',
        phase: 'Initiate',
        title: 'Stage Gate 1 with readiness checks',
        before: 'Readiness was a set of checklist columns on the Project Record.',
        now: 'Each gate has a configurable checklist evaluated against live project data. Approve is blocked while mandatory items are open. Approve with Exception needs a written justification, and the exception is recorded.',
        show: 'As Aisha, choose Request review for Stage Gate 1. As Elena, choose Decide: Approve is blocked while checks are open, and Approve with Exception asks for a justification. The requester can never approve their own review.',
        jumps: [
          { as: 'aisha.rahman', route: '/projects/{new}/governance', fallback: `${INITIATE_SAMPLE}/governance`, minStage: 'Initiate', screen: 'Governance', spot: { card: 'Stage gates & governance reviews' } },
          { as: 'elena.vasquez', route: '/approvals', screen: 'My approvals', spot: { card: 'Gate & governance reviews' } },
        ],
      },
      {
        id: 'f9',
        phase: 'Plan and fund',
        title: 'Staff the work',
        before: 'Capacity data lived in sheets and fed a separate Power BI report.',
        now: 'The same capacity calculation runs in the app. The Resource Team Manager nominates a named person or declares a gap, and the PM confirms or rejects. Gaps escalate to the PMO and pillar leads. Scenarios test shifted start dates and added capacity.',
        show: 'The Capacity heatmap, then Demand & nominations and Nominate on the Dealer Portal request.',
        jumps: [
          { as: 'marcus.webb', route: '/resources', screen: 'Capacity heatmap', spot: { card: 'Team utilization' } },
          { as: 'marcus.webb', route: '/resources?tab=nominations', screen: 'Demand & nominations', spot: { row: 'Dealer Portal Modernization' } },
        ],
      },
      {
        id: 'f10',
        phase: 'Plan and fund',
        title: 'Weekly status and health',
        before: 'The Weekly Status Tracker held scope, schedule, resource, budget and overall health, plus a path to green.',
        now: "Weekly status is required from Plan through Hypercare. Overall health is calculated: Red if any of scope, schedule, resource or budget is Red or Yellow. Calculated suggestions sit beside the PM's values, and overdue updates trigger reminders.",
        show: 'The health card on Overview, with reported and calculated values side by side.',
        jumps: [
          { as: 'jordan.blake', route: `${P1}/status`, screen: 'Weekly status', spot: { card: 'Current health' } },
          { as: 'jordan.blake', route: `${P1}/overview`, screen: 'Health on Overview', spot: { card: 'Health' } },
        ],
      },
      {
        id: 'f11',
        phase: 'Plan and fund',
        title: 'Stage Gates 2 and 3: funding approval',
        before: 'The Budget and Forecast sheet held the WBS element, spend type, approved budget and monthly columns, and the estimate sat in the Cost Estimator.',
        now: 'Stage Gate 2 confirms readiness for funding (ACT): BRD approved, plan baselined, resources feasible. Stage Gate 3 records the funding approval number and date. WBS elements and POs are captured after funding approval. Each capital or expense line is forecast monthly against its approved budget, with ERP actuals read-only.',
        show: "The forecast grid, then the pending Stage Gate 2 on ITProj-26-002 in Elena's inbox.",
        jumps: [
          { as: 'laura.chen', route: `${P1}/financials`, screen: 'Monthly forecast', spot: { card: 'Monthly forecast' } },
          { as: 'elena.vasquez', route: '/approvals', screen: 'Stage Gate 2 in My approvals', spot: { row: 'Dealer Portal Modernization' } },
        ],
      },
      {
        id: 'f12',
        phase: 'Deliver and close',
        title: 'Execute: design, build and test',
        before: 'The UAT Test Plan and UAT Defect Tracker sheets, with a test reference typed on each defect.',
        now: 'Design Review and the Change Review Board run when risk or architecture impact requires them. Every UAT test case traces to BRD requirements, and uncovered requirements are flagged. Open P1 or P2 defects block Go/No-Go.',
        show: 'The Testing tab.',
        jumps: [{ as: 'jordan.blake', route: `${P1}/testing`, screen: 'Testing', spot: { first: true } }],
      },
      {
        id: 'f13',
        phase: 'Deliver and close',
        title: 'Go/No-Go, CAB and go-live',
        before: 'The Cutover Plan and Hypercare Defect Tracker sheets.',
        now: 'Go/No-Go checks UAT, defects, the cutover plan and required reviews. CAB approves the production change. Go-Live & start Hypercare moves the project to Hypercare, where cutover tasks and hypercare defects are tracked to closure.',
        show: 'The pending Go/No-Go and its open checks.',
        jumps: [{ as: 'elena.vasquez', route: `${P1}/governance`, screen: 'Go/No-Go readiness', spot: { card: ['Readiness for', 'Stage gates & governance reviews'] } }],
      },
      {
        id: 'f14',
        phase: 'Deliver and close',
        title: 'Close and archive',
        before: 'Closure showed in a Workflow Status column, and the sheets stayed in the workspace.',
        now: 'Close needs hypercare defects closed and a current status, or an approved exception. Lessons learned and the benefits handoff are captured. Archive is manual, and history and audit are kept.',
        show: 'The Close checks on the Warehouse Management System Upgrade.',
        jumps: [{ as: 'elena.vasquez', route: '/projects/ITProj-26-006/governance', screen: 'Close checks', spot: { card: ['Next stage', 'Readiness for'] } }],
      },
    ],
  },
  {
    id: 'topics',
    tab: 'Topics',
    title: 'Across every step',
    intro: 'Themes to show whenever the audience asks: confidentiality, external people, reporting, audit and Teams.',
    numbered: false,
    steps: [
      {
        id: 'nda',
        title: 'Confidential NDA projects',
        points: [
          'Only the PMO Director can designate an NDA project. It stays hidden from standard users, dashboards, reports, search and notifications until it is converted.',
          'The approved access list can include internal and external people.',
        ],
        show: 'Switch to Victoria Hale. The acquisition project is missing from her portfolio, reports and search.',
        jumps: [
          { as: 'elena.vasquez', route: '/projects/ITProj-26-004/access', screen: 'NDA access list', spot: { card: ['Confidential NDA project', 'Confidential NDA workflow'] } },
          { as: 'victoria.hale', route: '/', screen: "Victoria's portfolio" },
        ],
      },
      {
        id: 'external',
        title: 'External collaborators',
        points: [
          'Access is View or Edit, per artifact or for the whole workspace. The sponsor or owner approves first, then an administrator.',
          'Expiry is mandatory, and access is revoked automatically when it lapses. Renewals, revocations and recertifications are audited.',
        ],
        show: 'Dana sees two projects, and only the artifacts she was granted.',
        jumps: [{ as: 'dana.whitfield', route: '/', screen: "Dana's view" }],
      },
      {
        id: 'reports',
        title: 'Portfolio view and reports',
        points: [
          'The dashboard shows stage, health, budget against forecast and actuals, upcoming go-lives and executive RAIDD items.',
          'Ten reports by business, function, pillar and stage, plus gate readiness, overdue updates and exceptions. Every view drills through to the project, and Power BI can read the same tables.',
        ],
        jumps: [
          { as: 'victoria.hale', route: '/reports', screen: 'Reports', spot: { card: 'Report library' } },
          { as: 'victoria.hale', route: '/', screen: 'Portfolio overview' },
        ],
      },
      {
        id: 'audit',
        title: 'A complete audit trail',
        points: [
          'Every field change, approval, exception, forecast, nomination and access event is recorded with the user, time, previous and new value.',
          'Standard users cannot edit or delete audit entries, and Dataverse table auditing is on for all 30 tables.',
        ],
        jumps: [{ as: 'elena.vasquez', route: '/audit', screen: 'Audit log' }],
      },
      {
        id: 'teams',
        title: 'Microsoft Teams',
        points: ['The same app runs as a Teams personal app, so people approve gates and update status where they already work.'],
      },
      {
        id: 'numbers',
        title: 'The numbers to end on',
        say: 'Same stages, gates, artifacts and numbering the PMO already used, now with one data model, enforced rules and one audit trail.',
        numbers: true,
      },
    ],
  },
];

/** The sample people, in the order the script introduces them. Names come from the sample data. */
export const CAST: { key: string; role: string; show: string }[] = [
  { key: 'priya.natarajan', role: 'Business Relationship Manager', show: 'Intake' },
  { key: 'elena.vasquez', role: 'PMO Director', show: 'Gate decisions, NDA projects, administration' },
  { key: 'aisha.rahman', role: 'Project Manager', show: 'Plan, RAIDD, status and forecast' },
  { key: 'jordan.blake', role: 'Senior Project Manager', show: 'A project in execution' },
  { key: 'marcus.webb', role: 'Resource Team Manager', show: 'Capacity and nominations' },
  { key: 'laura.chen', role: 'Finance', show: 'Budget, forecast and actuals' },
  { key: 'victoria.hale', role: 'Chief Information Officer, read-only', show: 'The executive view' },
  { key: 'tom.becker', role: 'System Administrator', show: 'Users, roles and settings' },
  { key: 'dana.whitfield', role: 'External consultant', show: 'Time-bound external access' },
];

export const NUMBERS: [string, string][] = [
  ['Template sheets per project', '16 become 1 IT Project record with child rows'],
  ['Dataverse', '30 tables, 49 relationships, 2 security roles'],
  ['Acceptance criteria', '18 of 18 covered by automated checks'],
  ['Automated workflow checks', '49, all passing'],
  ['Render checks', '4,650: every page for every persona, with an NDA leak check'],
];

/** The intake that step 1 fills in. Keys are the start of each field's label; dates are set from today. */
export const SAMPLE_INTAKE: [string, string][] = [
  ['Project name', 'Supplier Self-Service Portal'],
  ['Main objective', 'Give suppliers a self-service portal for onboarding, PO acknowledgement and invoice status, integrated with SAP and Ariba.'],
  ['Desired outcome', 'Cut supplier onboarding from 15 to 5 days and reduce AP status calls by 40%.'],
  ['Estimated cost', '480000'],
  ['Estimated benefit', '900000'],
  ['Benefit type', 'Productivity'],
  ['IT roadmap alignment', 'On FY27 IT Roadmap'],
  ['Business area', 'Corporate'],
  ['Business function', 'Procurement'],
  ['Corporate priority', 'Ops Excellence'],
  ['Primary IT pillar', 'Applications'],
];

/** Days from today for the planned dates. */
export const SAMPLE_DATES = { initiate: 14, execution: 60, goLive: 180, end: 240 };
