/**
 * Dataverse data model — the single source of truth for:
 *   • dataverse/provision.ts (creates the solution, tables, columns and relationships), and
 *   • src/data/dataverse.ts (maps app records <-> Dataverse Web API rows at runtime).
 *
 * Conventions
 *   • Publisher prefix from src/brand.ts (default `cordova_`); every SchemaName equals its logical name (all lower case), so the
 *     lookup navigation property used for `@odata.bind` is simply the column name.
 *   • Choice-like values (stage, status, health, types) are stored as text columns so PMO administrators
 *     can change the value lists in-app without a solution deployment (NFR-002).
 *   • The IT Project table is the container for every project artifact: artifact tables have a parental
 *     relationship to IT Project, so ownership/sharing (NDA restriction) cascades to all of a project's rows.
 */
import type { CollectionName, DirectoryPerson, EntityName } from '../domain/types';
import { SCHEMAS, type FieldDef } from '../domain/schemas';
import { DATAVERSE, TABLE_PREFIX } from '../brand';

export const PREFIX = TABLE_PREFIX;
export const SOLUTION = DATAVERSE.solution;
export const PUBLISHER = { ...DATAVERSE.publisher, prefix: DATAVERSE.prefix };

export type ColType =
  | 'string'
  | 'memo'
  | 'decimal'
  | 'int'
  | 'bool'
  | 'date' // date only, YYYY-MM-DD
  | 'datetime' // UTC timestamp (ISO)
  | 'wallclock' // time-zone independent date+time (YYYY-MM-DDTHH:mm)
  | 'lookup'
  | 'ref' // id of another row stored as text (no relationship)
  | 'json'
  | 'csv'
  | 'file'; // Dataverse file column (binary, uploaded separately)

export interface ColDef {
  key: string;
  col: string;
  type: ColType;
  label: string;
  max?: number;
  target?: EntityName;
  parental?: boolean;
  autoNumber?: string;
}

export interface EntityDef {
  name: EntityName;
  table: string;
  set: string;
  display: string;
  plural: string;
  description: string;
  pk: string;
  ownership: 'UserOwned' | 'OrganizationOwned';
  primary: { key?: string; compute?: (r: any) => string; label: string; max: number };
  cols: ColDef[];
  /** artifact rows: domain createdBy/updatedBy are profile ids stored as text */
  tracksEditors?: boolean;
}

const colName = (key: string, type: ColType) => PREFIX + (type === 'lookup' ? key.replace(/Id$/, '') : key).toLowerCase();
const c = (key: string, type: ColType, label: string, extra: Partial<ColDef> = {}): ColDef => ({ key, col: colName(key, type), type, label, ...extra });
const lk = (key: string, target: EntityName, label: string, parental = false): ColDef => c(key, 'lookup', label, { target, parental });
const project = lk('projectId', 'projects', 'IT Project', true);

function entity(
  name: EntityName,
  table: string,
  display: string,
  plural: string,
  description: string,
  primary: EntityDef['primary'],
  cols: ColDef[],
  opts: Partial<EntityDef> = {},
): EntityDef {
  const tbl = PREFIX + table;
  const set = tbl.endsWith('s') ? tbl + 'es' : tbl.endsWith('y') ? tbl.slice(0, -1) + 'ies' : tbl + 's';
  return { name, table: tbl, set, display, plural, description, pk: tbl + 'id', ownership: 'UserOwned', primary, cols, ...opts };
}

const FIELD_TYPE: Record<FieldDef['type'], ColType | null> = {
  text: 'string',
  textarea: 'memo',
  number: 'decimal',
  currency: 'decimal',
  percent: 'int',
  date: 'date',
  datetime: 'wallclock',
  select: 'string',
  health: 'string',
  checkbox: 'bool',
  user: 'lookup',
  team: 'lookup',
  testCaseRef: 'lookup',
  requirementRefs: null, // stored in the requirement trace table
};

const LOOKUP_TARGET: Partial<Record<FieldDef['type'], EntityName>> = { user: 'users', team: 'teams', testCaseRef: 'testCases' };

const ARTIFACT_TABLES: Record<CollectionName, { table: string; display: string; plural: string; code: string; primary: string; extra?: ColDef[] }> = {
  stakeholders: { table: 'stakeholder', display: 'Stakeholder', plural: 'Stakeholder Register', code: '0.0', primary: 'name' },
  raci: { table: 'raciitem', display: 'RACI Item', plural: 'Project RACI', code: '0.0b', primary: 'deliverable', extra: [c('order', 'int', 'Sort Order')] },
  requirements: { table: 'requirement', display: 'Requirement', plural: 'BRD Requirements', code: '1.0', primary: 'title', extra: [lk('parentId', 'requirements', 'Parent Requirement'), c('order', 'int', 'Sort Order')] },
  tasks: { table: 'plantask', display: 'Plan Task', plural: 'Project Plan', code: '2.0', primary: 'name', extra: [lk('parentId', 'tasks', 'Parent Task'), c('order', 'int', 'Sort Order')] },
  demands: {
    table: 'resourcedemand',
    display: 'Resource Demand',
    plural: 'Resource Estimator',
    code: '3.0',
    primary: 'placeholder',
    extra: [
      lk('nominatedResourceId', 'resources', 'Nominated Resource'),
      c('nominatedHours', 'decimal', 'Nominated Hours'),
      c('nominatedById', 'ref', 'Nominated By'),
      c('nominatedAt', 'datetime', 'Nominated On'),
      c('decidedById', 'ref', 'Confirmed/Rejected By'),
      c('decidedAt', 'datetime', 'Confirmed/Rejected On'),
      c('rejectionReason', 'memo', 'Rejection Reason'),
      c('escalated', 'bool', 'Escalated'),
      c('parentDemandId', 'ref', 'Split From Demand'),
    ],
  },
  forecastLines: { table: 'forecastline', display: 'Forecast Line', plural: 'Budget and Forecast', code: '3.5', primary: 'description' },
  costItems: { table: 'costitem', display: 'Cost Item', plural: 'Cost Estimator', code: '4.0', primary: 'itCategory', extra: [lk('parentId', 'costItems', 'Parent Cost Item'), c('order', 'int', 'Sort Order')] },
  raidd: { table: 'raidditem', display: 'RAIDD Item', plural: 'RAIDD Log', code: '5.0', primary: 'title', extra: [c('closedAt', 'datetime', 'Date Closed')] },
  testCases: { table: 'testcase', display: 'Test Case', plural: 'UAT Test Plan', code: '6.0', primary: 'title' },
  uatDefects: { table: 'uatdefect', display: 'UAT Defect', plural: 'UAT Defect Tracker', code: '6.0b', primary: 'title' },
  cutoverTasks: { table: 'cutovertask', display: 'Cutover Task', plural: 'Cutover Plan', code: '7.0', primary: 'taskName' },
  hypercareDefects: { table: 'hypercaredefect', display: 'Hypercare Defect', plural: 'Hypercare Defect Tracker', code: '8.0', primary: 'title' },
  statusUpdates: { table: 'statusupdate', display: 'Status Update', plural: 'Weekly Status Tracker', code: '9.0', primary: 'executiveSummary' },
};

function artifactEntity(name: CollectionName): EntityDef {
  const a = ARTIFACT_TABLES[name];
  const schema = SCHEMAS[name];
  const cols: ColDef[] = [project];
  for (const f of schema.fields) {
    if (f.key === a.primary) continue;
    const t = FIELD_TYPE[f.type];
    if (!t) continue;
    if (t === 'lookup') cols.push(lk(f.key, LOOKUP_TARGET[f.type]!, f.label));
    else cols.push(c(f.key, t, f.label, { max: t === 'string' ? 400 : undefined }));
  }
  cols.push(...(a.extra || []), c('createdBy', 'ref', 'Created By (PPM user)'), c('updatedBy', 'ref', 'Modified By (PPM user)'));
  const primaryField = schema.fields.find((f) => f.key === a.primary)!;
  return entity(name, a.table, a.display, a.plural, `${a.code} ${a.plural} – artifact rows belonging to an IT Project.`, { key: a.primary, label: primaryField.label, max: primaryField.type === 'textarea' ? 4000 : 400 }, cols, { tracksEditors: true });
}

const people = ['sponsorId', 'pmId', 'baId', 'itDeliveryLeadId', 'technicalLeadId', 'architectId'];

export const ENTITIES: EntityDef[] = [
  entity('users', 'ppmuser', 'PPM User', 'PPM Users', 'PPM user profile: application roles, pillar and notification preferences (maps to an Entra ID / B2B guest user).', { key: 'name', label: 'Full Name', max: 200 }, [
    c('email', 'string', 'Email', { max: 320 }),
    c('title', 'string', 'Job Title'),
    c('roles', 'csv', 'PPM Roles', { max: 400 }),
    c('pillar', 'string', 'Pillar'),
    c('external', 'bool', 'External User'),
    c('active', 'bool', 'Active'),
    c('notifyEmail', 'bool', 'Notify by Email'),
    c('notifyTeams', 'bool', 'Notify in Teams'),
  ], { ownership: 'OrganizationOwned' }),

  entity('projects', 'itproject', 'IT Project', 'IT Projects', 'IT Project — the system of record for intake, lifecycle, governance and the container for all project artifacts.', { key: 'name', label: 'Project Name', max: 300 }, [
    c('code', 'string', 'Project ID', { max: 40, autoNumber: 'ITProj-{DATETIMEUTC:yy}-{SEQNUM:3}' }),
    c('projectType', 'string', 'Type of Project'),
    c('mainObjective', 'memo', 'Main Objective'),
    c('desiredOutcome', 'memo', 'Desired Outcome / Benefits Case'),
    c('estimatedCost', 'decimal', 'Estimated Cost'),
    c('estimatedBenefit', 'decimal', 'Estimated Benefit'),
    c('benefitType', 'string', 'Benefit Type'),
    c('roadmapAlignment', 'string', 'FY IT Roadmap'),
    c('plannedInitiateDate', 'date', 'Planned Initiate Date'),
    c('plannedExecuteDate', 'date', 'Planned Execution Date'),
    c('plannedGoLiveDate', 'date', 'Planned Go-Live Date'),
    c('plannedEndDate', 'date', 'Planned End Date'),
    lk('brmId', 'users', 'BRM'),
    c('businessArea', 'string', 'Business'),
    c('businessFunction', 'string', 'Business Function'),
    c('corporatePriority', 'string', 'Corporate Priority'),
    c('program', 'string', 'Program'),
    c('pillar', 'string', 'Primary IT Pillar'),
    c('agile', 'bool', 'Agile'),
    c('itgc', 'bool', 'ITGC'),
    c('itgcApplications', 'string', 'ITGC Applications'),
    c('transformation', 'bool', 'Transformation Project'),
    c('stage', 'string', 'Lifecycle Stage'),
    c('status', 'string', 'Project Status'),
    c('readyForReview', 'bool', 'Ready for Review'),
    c('readyForReviewAt', 'datetime', 'Submitted for Review On'),
    c('createdById', 'ref', 'Created By (PPM user)'),
    c('approvalDate', 'datetime', 'Approval Date (Draft to Initiate)'),
    c('stageEnteredAt', 'datetime', 'Stage Entered On'),
    ...people.map((k) => lk(k, 'users', { sponsorId: 'Sponsor', pmId: 'Project Manager', baId: 'Business Analyst', itDeliveryLeadId: 'IT Delivery Lead', technicalLeadId: 'Technical Lead', architectId: 'Architect' }[k]!)),
    c('estHoursBucket', 'string', 'Est. Hrs. Bucket (ROM)'),
    c('existingApplications', 'memo', 'Existing Applications or Platforms'),
    c('businessOwnerApps', 'string', 'Business Owner of Impacted Applications'),
    c('dataMigration', 'bool', 'Data Migration'),
    c('dataMigrationDetails', 'memo', 'What data needs to be migrated'),
    c('integrationWork', 'memo', 'Integration Work'),
    c('infrastructureWork', 'memo', 'Infrastructure Work'),
    c('cyberWork', 'memo', 'Cyber Work'),
    c('insightWork', 'memo', 'Insight Work'),
    c('connectionsToOtherSystems', 'memo', 'Connection to Other Systems'),
    c('actNumber', 'string', 'ACT Number'),
    c('actApprovedDate', 'date', 'ACT Approval Date'),
    c('approvedBudget', 'decimal', 'Approved Budget'),
    c('pi', 'decimal', 'PI'),
    c('costCenter', 'string', 'Cost Center'),
    c('multipleCostCenters', 'bool', 'Multiple Cost Centers'),
    c('glCode', 'string', 'G/L Code'),
    c('wbsElements', 'csv', 'WBS Elements', { max: 1000 }),
    c('poNumbers', 'csv', 'PO Numbers', { max: 1000 }),
    c('serviceNowChange', 'string', 'ServiceNow Change'),
    c('jiraKey', 'string', 'Jira Key'),
    c('drbRequired', 'bool', 'Design Review Required'),
    c('crbRequired', 'bool', 'CRB Required'),
    c('cabRequired', 'bool', 'CAB Required'),
    c('governanceDrivers', 'csv', 'Governance Drivers', { max: 1000 }),
    c('healthScope', 'string', 'Scope Health'),
    c('healthSchedule', 'string', 'Schedule Health'),
    c('healthResource', 'string', 'Resource Health'),
    c('healthBudget', 'string', 'Budget Health'),
    c('healthOverall', 'string', 'Overall Health'),
    c('healthAsOf', 'date', 'Health As Of'),
    c('actualGoLiveDate', 'date', 'Actual Go-Live Date'),
    c('closedDate', 'date', 'Closed Date'),
    c('lessonsLearned', 'memo', 'Lessons Learned'),
    c('ndaActive', 'bool', 'NDA Workflow Active'),
    c('ndaConverted', 'bool', 'NDA Converted to Regular Workflow'),
    c('ndaCodename', 'string', 'NDA Codename'),
    c('ndaRationale', 'memo', 'NDA Business Rationale'),
    c('ndaDesignatedById', 'ref', 'NDA Designated By'),
    c('ndaDesignatedAt', 'datetime', 'NDA Designated On'),
    c('ndaConvertedById', 'ref', 'NDA Converted By'),
    c('ndaConvertedAt', 'datetime', 'NDA Converted On'),
    c('ndaConversionRationale', 'memo', 'NDA Conversion Rationale'),
    c('ndaLastReviewedAt', 'datetime', 'NDA Access Last Reviewed'),
    c('restrictedArtifacts', 'csv', 'Restricted Artifacts', { max: 1000 }),
    c('artifactsInitializedAt', 'datetime', 'Artifacts Initialized On'),
    c('demo', 'bool', 'Sample Data'),
  ]),

  entity('gateReviews', 'gatereview', 'Gate Review', 'Gate Reviews', 'X.0b Approvals – stage gate and governance review decisions (SG0–SG3, DRB, CRB, Go/No-Go, CAB).', { compute: (r) => `${r.gate} review`, label: 'Review', max: 100 }, [
    project,
    c('gate', 'string', 'Gate'),
    c('status', 'string', 'Review Status'),
    c('requestedById', 'ref', 'Requested By'),
    c('requestedAt', 'datetime', 'Requested On'),
    c('requestNotes', 'memo', 'Request Notes'),
    c('decision', 'string', 'Decision'),
    c('decidedById', 'ref', 'Decided By'),
    c('decidedAt', 'datetime', 'Decided On'),
    c('comments', 'memo', 'Decision Comments'),
    c('conditions', 'memo', 'Conditions'),
    c('failedChecks', 'csv', 'Failed Checks', { max: 1000 }),
    c('exceptionId', 'ref', 'Exception'),
  ]),

  entity('exceptions', 'governanceexception', 'Governance Exception', 'Governance Exceptions', 'Documented, approved exceptions to required governance artifacts (PPM-CN-005).', { compute: (r) => `Exception – ${r.context}`, label: 'Exception', max: 100 }, [
    project,
    c('context', 'string', 'Gate / Transition'),
    c('items', 'csv', 'Excepted Checks', { max: 1000 }),
    c('justification', 'memo', 'Justification'),
    c('approvedById', 'ref', 'Approved By'),
    c('approvedAt', 'datetime', 'Approved On'),
  ]),

  entity('accessGrants', 'accessgrant', 'External Access Grant', 'External Access Grants', 'Time-bound, sponsor/owner-approved access for external and non-employee users (EXT-FR-001..010).', { key: 'name', label: 'Grantee Name', max: 200 }, [
    project,
    c('email', 'string', 'Grantee Email', { max: 320 }),
    c('userId', 'ref', 'Grantee PPM User'),
    c('scope', 'string', 'Scope'),
    c('artifactKeys', 'csv', 'Artifacts', { max: 1000 }),
    c('permission', 'string', 'Permission'),
    c('expiresAt', 'date', 'Expires On'),
    c('status', 'string', 'Grant Status'),
    c('justification', 'memo', 'Justification'),
    c('requestedById', 'ref', 'Requested By'),
    c('requestedAt', 'datetime', 'Requested On'),
    c('sponsorApprovedById', 'ref', 'Sponsor/Owner Approved By'),
    c('sponsorApprovedAt', 'datetime', 'Sponsor/Owner Approved On'),
    c('adminApprovedById', 'ref', 'Admin Approved By'),
    c('adminApprovedAt', 'datetime', 'Admin Approved On'),
    c('closedById', 'ref', 'Closed By'),
    c('closedAt', 'datetime', 'Closed On'),
    c('closeReason', 'memo', 'Close Reason'),
    c('renewalOfId', 'ref', 'Renewal Of'),
    c('expiryWarned', 'bool', 'Expiry Warning Sent'),
    c('lastRecertifiedAt', 'datetime', 'Last Recertified'),
  ]),

  entity('ndaAccess', 'ndaaccess', 'NDA Access Entry', 'NDA Access List', 'Approved access list for confidential NDA projects (NDA-FR-006/007). Synced to the project owner team by Power Automate.', { compute: () => 'NDA access', label: 'Entry', max: 100 }, [
    project,
    lk('userId', 'users', 'Person'),
    c('designee', 'bool', 'Access List Designee'),
    c('addedById', 'ref', 'Added By'),
    c('addedAt', 'datetime', 'Added On'),
    c('lastRecertifiedAt', 'datetime', 'Last Recertified'),
  ]),

  entity('notifications', 'notification', 'PPM Notification', 'PPM Notifications', 'In-app notifications; Power Automate delivers the email/Teams channels (NOT-FR-001..009).', { key: 'title', label: 'Title', max: 400 }, [
    lk('userId', 'users', 'Recipient'),
    c('projectId', 'ref', 'IT Project'),
    c('type', 'string', 'Notification Type'),
    c('body', 'memo', 'Message'),
    c('link', 'string', 'Link'),
    c('channels', 'csv', 'Channels'),
    c('sentAt', 'datetime', 'Sent On'),
    c('read', 'bool', 'Read'),
  ]),

  entity('auditEvents', 'auditevent', 'PPM Audit Event', 'PPM Audit Events', 'Business audit trail (approvals, exceptions, NDA, access events, field changes). Create-only for all users; Dataverse auditing provides the platform audit log.', { key: 'action', label: 'Action', max: 100 }, [
    c('ts', 'datetime', 'Timestamp'),
    c('userId', 'ref', 'PPM User'),
    c('userEmail', 'string', 'User Email', { max: 320 }),
    c('entity', 'string', 'Entity'),
    c('entityId', 'ref', 'Record'),
    c('projectId', 'ref', 'IT Project'),
    c('artifact', 'string', 'Artifact'),
    c('field', 'string', 'Field'),
    c('before', 'memo', 'Previous Value'),
    c('after', 'memo', 'New Value'),
    c('details', 'memo', 'Details'),
  ]),

  entity('settings', 'ppmsetting', 'PPM Setting', 'PPM Settings', 'Configurable workflow rules, gate approvers/checklists and master data (NFR-002, NFR-006).', { key: 'name', label: 'Name', max: 100 }, [c('configJson', 'json', 'Configuration (JSON)', { max: 100000 })], { ownership: 'OrganizationOwned' }),

  entity('attachments', 'intakeattachment', 'Intake Attachment', 'Intake Attachments', 'Supporting uploads captured on the BRM intake form (PPM-FR-002).', { key: 'fileName', label: 'File Name', max: 260 }, [
    project,
    c('size', 'int', 'Size (bytes)'),
    c('file', 'file', 'File'),
    c('uploadedById', 'ref', 'Uploaded By'),
    c('uploadedAt', 'datetime', 'Uploaded On'),
  ]),

  entity('teams', 'resourceteam', 'Resource Team', 'Resource Teams', 'Delivery teams used for resource capacity planning.', { key: 'name', label: 'Team Name', max: 200 }, [c('pillar', 'string', 'Pillar'), lk('managerId', 'users', 'Resource Team Manager')]),

  entity('resources', 'resource', 'Resource', 'Resources', 'Named resources (internal, external, staff augmentation) with active window.', { key: 'name', label: 'Resource Name', max: 200 }, [
    c('email', 'string', 'Email', { max: 320 }),
    c('resourceType', 'string', 'Resource Type'),
    c('specialty', 'string', 'Specialty'),
    c('organization', 'string', 'Organization'),
    c('active', 'bool', 'Active'),
    c('startDate', 'date', 'Work Start Date'),
    c('endDate', 'date', 'Work End Date'),
  ]),

  entity('assignments', 'teamassignment', 'Team Assignment', 'Team Assignments', 'Weekly hours and project utilization % of a resource on a team (RCP-FR-006).', { compute: () => 'Assignment', label: 'Assignment', max: 100 }, [
    lk('resourceId', 'resources', 'Resource'),
    lk('teamId', 'teams', 'Team'),
    c('weeklyHours', 'decimal', 'Weekly Work Hours'),
    c('utilizationPct', 'int', 'Project Utilization %'),
  ]),

  entity('scenarios', 'capacityscenario', 'Capacity Scenario', 'Capacity Scenarios', 'Saved what-if capacity scenarios (RCP-FR-011/012); never change the official plan.', { key: 'name', label: 'Scenario Name', max: 200 }, [
    c('description', 'memo', 'Description'),
    c('createdById', 'ref', 'Created By'),
    c('includeProposed', 'bool', 'Include Proposed Projects'),
    c('shifts', 'json', 'Project Start Shifts (JSON)', { max: 20000 }),
    c('capacityAdjust', 'json', 'Capacity Adjustments (JSON)', { max: 20000 }),
    c('excluded', 'json', 'Excluded Projects (JSON)', { max: 20000 }),
  ]),

  entity('forecastEntries', 'forecastentry', 'Forecast Entry', 'Forecast Entries', 'Monthly forecast amount for a forecast line (FIN-FR-001).', { key: 'period', label: 'Period (YYYY-MM)', max: 10 }, [project, lk('lineId', 'forecastLines', 'Forecast Line'), c('amount', 'decimal', 'Amount')]),

  entity('actuals', 'financialactual', 'Financial Actual', 'Financial Actuals', 'SAP-sourced financial actuals (SAP remains the system of record).', { key: 'wbsElement', label: 'WBS Element', max: 100 }, [
    project,
    c('period', 'string', 'Period (YYYY-MM)', { max: 10 }),
    c('category', 'string', 'Capital / Expense'),
    c('amount', 'decimal', 'Amount'),
    c('docRef', 'string', 'SAP Document'),
    c('importedAt', 'datetime', 'Imported On'),
  ]),

  entity('traces', 'requirementtrace', 'Requirement Trace', 'Requirement Traces', 'Requirement-to-test traceability (BRD-FR-003).', { compute: () => 'Trace', label: 'Trace', max: 100 }, [project, lk('testCaseId', 'testCases', 'Test Case'), lk('requirementId', 'requirements', 'Requirement')]),

  ...(Object.keys(ARTIFACT_TABLES) as CollectionName[]).map(artifactEntity),
];

export const entityDef = (name: EntityName) => ENTITIES.find((e) => e.name === name)!;

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

/** App record -> Dataverse Web API payload. */
export function toDataverse(name: EntityName, rec: Record<string, any>, isCreate: boolean): Record<string, unknown> {
  const def = entityDef(name);
  const out: Record<string, unknown> = {};
  const primary = def.primary.key ? rec[def.primary.key] : def.primary.compute?.(rec);
  if (primary !== undefined || isCreate) out[PREFIX + 'name'] = String(primary ?? '').slice(0, def.primary.max);
  for (const col of def.cols) {
    if (!(col.key in rec)) continue;
    if (col.autoNumber || col.type === 'file') continue; // server-assigned / uploaded separately
    const v = rec[col.key];
    switch (col.type) {
      case 'lookup': {
        const target = entityDef(col.target!);
        if (!isEmpty(v)) out[`${col.col}@odata.bind`] = `/${target.set}(${v})`;
        else if (!isCreate) out[`${col.col}@odata.bind`] = null;
        break;
      }
      case 'bool':
        out[col.col] = !!v;
        break;
      case 'decimal':
      case 'int':
        out[col.col] = isEmpty(v) || isNaN(Number(v)) ? null : col.type === 'int' ? Math.round(Number(v)) : Number(v);
        break;
      case 'date':
        out[col.col] = isEmpty(v) ? null : String(v).slice(0, 10);
        break;
      case 'datetime':
        out[col.col] = isEmpty(v) ? null : new Date(v).toISOString();
        break;
      case 'wallclock':
        out[col.col] = isEmpty(v) ? null : `${String(v).slice(0, 16)}:00Z`;
        break;
      case 'csv':
        out[col.col] = Array.isArray(v) && v.length ? v.join(',') : null;
        break;
      case 'json':
        out[col.col] = v == null ? null : JSON.stringify(v);
        break;
      default:
        out[col.col] = isEmpty(v) ? null : String(v).slice(0, col.max ?? (col.type === 'memo' ? 100000 : 400));
    }
  }
  if (isCreate && rec.createdAt) out['overriddencreatedon'] = new Date(rec.createdAt).toISOString();
  return out;
}

/** Dataverse Web API row -> app record. */
export function fromDataverse(name: EntityName, row: Record<string, any>): Record<string, any> {
  const def = entityDef(name);
  const out: Record<string, any> = { id: row[def.pk], createdAt: row.createdon, updatedAt: row.modifiedon };
  if (def.primary.key) out[def.primary.key] = row[PREFIX + 'name'] ?? '';
  for (const col of def.cols) {
    if (col.type === 'file') continue;
    if (col.type === 'lookup') {
      const v = row[`_${col.col}_value`];
      if (v) out[col.key] = v;
      continue;
    }
    const v = row[col.col];
    switch (col.type) {
      case 'csv':
        out[col.key] = v ? String(v).split(',').filter(Boolean) : [];
        break;
      case 'json':
        try {
          out[col.key] = v ? JSON.parse(v) : undefined;
        } catch {
          out[col.key] = undefined;
        }
        break;
      case 'date':
        if (v) out[col.key] = String(v).slice(0, 10);
        break;
      case 'wallclock':
        if (v) out[col.key] = String(v).slice(0, 16);
        break;
      case 'bool':
        out[col.key] = !!v;
        break;
      default:
        if (v !== null && v !== undefined) out[col.key] = v;
    }
  }
  if (def.tracksEditors) {
    out.createdBy ||= '';
    out.updatedBy ||= out.createdBy;
  }
  return out;
}

/**
 * Organization directory: the environment's Users table (systemuser), which Dataverse keeps in sync with Entra ID.
 * Basic User grants organization-wide read on it, so every PPM user can search it.
 */
export const DIRECTORY = {
  set: 'systemusers',
  select: ['systemuserid', 'fullname', 'internalemailaddress', 'domainname', 'jobtitle', 'title'],
  orderBy: ['fullname'],
  /** name or email starts with `q`; excludes disabled, application and non-interactive users (accessmode 0–2 only) */
  filter(q: string) {
    const s = q.replace(/'/g, "''");
    const startsWith = ['fullname', 'firstname', 'lastname', 'internalemailaddress', 'domainname'].map((c) => `startswith(${c},'${s}')`).join(' or ');
    return `(${startsWith}) and isdisabled eq false and accessmode lt 3 and applicationid eq null`;
  },
  toPeople(rows: Record<string, any>[]): DirectoryPerson[] {
    return rows
      .map((r) => ({ name: r.fullname as string, email: String(r.internalemailaddress || r.domainname || '').toLowerCase(), title: r.jobtitle || r.title || undefined, guest: String(r.domainname || '').includes('#EXT#') }))
      .filter((p) => p.name && p.email);
  },
};

export function selectColumns(name: EntityName): string[] {
  const def = entityDef(name);
  return [def.pk, PREFIX + 'name', 'createdon', 'modifiedon', ...def.cols.filter((c) => c.type !== 'file').map((c) => (c.type === 'lookup' ? `_${c.col}_value` : c.col))];
}
