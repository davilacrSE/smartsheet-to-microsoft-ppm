// Domain model for the IT PPM accelerator (BRD §12 Core Data Entities).
// Every interface maps 1:1 to a Dataverse table defined in src/data/model.ts.

export type Role =
  | 'BRM'
  | 'PMO_DIRECTOR'
  | 'PMO_ADMIN'
  | 'PM'
  | 'BA'
  | 'PILLAR_LEAD'
  | 'ARCHITECT'
  | 'SME'
  | 'FINANCE'
  | 'RTM'
  | 'EXEC'
  | 'SYS_ADMIN'
  | 'EXTERNAL';

export type Stage =
  | 'Draft'
  | 'Initiate'
  | 'Plan'
  | 'ACT Readiness'
  | 'ACT Approved / Execute Ready'
  | 'Execute'
  | 'Go-Live / Hypercare'
  | 'Close'
  | 'Archive';

export type ProjectStatus = 'Active' | 'On Hold' | 'Withdrawn' | 'Rejected' | 'Closed Complete' | 'Archived';
export type Health = 'Green' | 'Yellow' | 'Red';
export type GateKey = 'SG0' | 'SG1' | 'SG2' | 'SG3' | 'DRB' | 'CRB' | 'GNG' | 'CAB';
export type TransitionKey = 'START_EXECUTE' | 'GO_LIVE' | 'CLOSE';
export type GateDecision = 'Approve' | 'Rework' | 'Stop' | 'Hold' | 'Approve with Exception';
export type NominationStatus = 'Requested' | 'Nominated' | 'Confirmed' | 'Rejected' | 'Gap' | 'Cancelled';
export type ResourceType = 'Internal' | 'External' | 'Staff Augmentation';

/** Artifact tables — child rows of an IT Project. */
export type CollectionName =
  | 'stakeholders'
  | 'raci'
  | 'requirements'
  | 'tasks'
  | 'demands'
  | 'forecastLines'
  | 'costItems'
  | 'raidd'
  | 'testCases'
  | 'uatDefects'
  | 'cutoverTasks'
  | 'hypercareDefects'
  | 'statusUpdates';

export type EntityName =
  | 'users'
  | 'projects'
  | 'gateReviews'
  | 'exceptions'
  | 'accessGrants'
  | 'ndaAccess'
  | 'notifications'
  | 'auditEvents'
  | 'settings'
  | 'attachments'
  | 'teams'
  | 'resources'
  | 'assignments'
  | 'scenarios'
  | 'forecastEntries'
  | 'actuals'
  | 'traces'
  | CollectionName;

export type ArtifactKey =
  | 'stakeholders'
  | 'projectRecord'
  | 'raci'
  | 'brd'
  | 'plan'
  | 'resourceEstimator'
  | 'budget'
  | 'costEstimator'
  | 'raidd'
  | 'uatPlan'
  | 'uatDefects'
  | 'cutover'
  | 'hypercare'
  | 'status'
  | 'metadata'
  | 'approvals'
  | 'dashboard';

interface Row {
  id: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface User extends Row {
  name: string;
  email: string;
  title?: string;
  roles: Role[];
  pillar?: string;
  external: boolean;
  active: boolean;
  notifyEmail: boolean;
  notifyTeams: boolean;
}

/** A person from the organization directory (Dataverse Users / Entra ID), who may not have a PPM profile yet. */
export interface DirectoryPerson {
  name: string;
  email: string;
  title?: string;
  guest: boolean; // Entra B2B guest
}

export interface Project extends Row {
  code: string; // ITProj-YY-NNN (Dataverse autonumber)
  projectType: string;
  // Intake (PPM-FR-002)
  name: string;
  mainObjective: string;
  desiredOutcome: string;
  estimatedCost: number;
  estimatedBenefit: number;
  benefitType: string;
  roadmapAlignment: string;
  plannedInitiateDate: string;
  plannedExecuteDate: string;
  plannedGoLiveDate: string;
  plannedEndDate?: string;
  brmId: string;
  businessArea: string;
  businessFunction: string;
  corporatePriority: string;
  program?: string;
  pillar: string;
  agile: boolean;
  itgc: boolean;
  itgcApplications?: string;
  transformation?: boolean;
  // Lifecycle (REC-001: stage and status are separate)
  stage: Stage;
  status: ProjectStatus;
  readyForReview: boolean;
  readyForReviewAt?: string;
  createdById: string;
  approvalDate?: string;
  stageEnteredAt: string;
  // Project record
  sponsorId?: string;
  pmId?: string;
  baId?: string;
  itDeliveryLeadId?: string;
  technicalLeadId?: string;
  architectId?: string;
  estHoursBucket?: string;
  existingApplications?: string;
  businessOwnerApps?: string;
  dataMigration?: boolean;
  dataMigrationDetails?: string;
  integrationWork?: string;
  infrastructureWork?: string;
  cyberWork?: string;
  insightWork?: string;
  connectionsToOtherSystems?: string;
  // Finance (FIN-FR-002)
  actNumber?: string;
  actApprovedDate?: string;
  approvedBudget?: number;
  pi?: number;
  costCenter?: string;
  multipleCostCenters?: boolean;
  glCode?: string;
  wbsElements: string[];
  poNumbers: string[];
  // Integrations
  serviceNowChange?: string;
  jiraKey?: string;
  // Governance (GOV-FR-002)
  drbRequired: boolean;
  crbRequired: boolean;
  cabRequired: boolean;
  governanceDrivers: string[];
  // Health (STAT-FR-003/004)
  healthScope?: Health;
  healthSchedule?: Health;
  healthResource?: Health;
  healthBudget?: Health;
  healthOverall?: Health;
  healthAsOf?: string;
  actualGoLiveDate?: string;
  closedDate?: string;
  lessonsLearned?: string;
  // Confidential NDA workflow (§17)
  ndaActive: boolean;
  ndaConverted: boolean;
  ndaCodename?: string;
  ndaRationale?: string;
  ndaDesignatedById?: string;
  ndaDesignatedAt?: string;
  ndaConvertedById?: string;
  ndaConvertedAt?: string;
  ndaConversionRationale?: string;
  ndaLastReviewedAt?: string;
  restrictedArtifacts: ArtifactKey[];
  artifactsInitializedAt?: string;
  demo?: boolean;
}

export interface GateReview extends Row {
  projectId: string;
  gate: GateKey;
  status: 'Pending' | 'Decided' | 'Cancelled';
  requestedById: string;
  requestedAt: string;
  requestNotes?: string;
  decision?: GateDecision;
  decidedById?: string;
  decidedAt?: string;
  comments?: string;
  conditions?: string;
  failedChecks: string[];
  exceptionId?: string;
}

export interface ExceptionRec extends Row {
  projectId: string;
  context: string; // gate key or transition key
  items: string[]; // failed check ids being excepted
  justification: string;
  approvedById: string;
  approvedAt: string;
}

export type GrantStatus = 'Pending Sponsor' | 'Pending Admin' | 'Active' | 'Rejected' | 'Expired' | 'Revoked';

export interface AccessGrant extends Row {
  projectId: string;
  email: string;
  name: string;
  userId?: string;
  scope: 'workspace' | 'artifact';
  artifactKeys: ArtifactKey[];
  permission: 'View' | 'Edit';
  expiresAt: string;
  status: GrantStatus;
  justification: string;
  requestedById: string;
  requestedAt: string;
  sponsorApprovedById?: string;
  sponsorApprovedAt?: string;
  adminApprovedById?: string;
  adminApprovedAt?: string;
  closedById?: string;
  closedAt?: string;
  closeReason?: string;
  renewalOfId?: string;
  expiryWarned?: boolean;
  lastRecertifiedAt?: string;
}

export interface NdaAccess extends Row {
  projectId: string;
  userId: string;
  designee: boolean;
  addedById: string;
  addedAt: string;
  lastRecertifiedAt?: string;
}

export interface Notification extends Row {
  userId: string;
  projectId?: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  channels: string[]; // email / teams — delivered by Power Automate
  sentAt: string;
  read: boolean;
}

export interface AuditEvent extends Row {
  ts: string;
  userId: string;
  userEmail: string;
  action: string;
  entity: string;
  entityId?: string;
  projectId?: string;
  artifact?: string;
  field?: string;
  before?: string;
  after?: string;
  details?: string;
}

export interface SettingsRow extends Row {
  name: string;
  configJson: string;
}

export interface Attachment extends Row {
  projectId: string;
  fileName: string;
  size: number;
  uploadedById: string;
  uploadedAt: string;
}

export interface Team extends Row {
  name: string;
  pillar: string;
  managerId: string;
}

export interface Resource extends Row {
  name: string;
  email?: string;
  resourceType: ResourceType;
  specialty: string;
  organization?: string;
  active: boolean;
  startDate?: string;
  endDate?: string;
}

/** RCP-FR-006: a resource can hold duties across multiple teams. */
export interface Assignment extends Row {
  resourceId: string;
  teamId: string;
  weeklyHours: number;
  utilizationPct: number;
}

export interface Scenario extends Row {
  name: string;
  description: string;
  createdById: string;
  includeProposed: boolean;
  shifts: Record<string, number>; // projectId -> months shifted
  capacityAdjust: Record<string, number>; // teamId -> % change
  excluded: string[];
}

export interface ForecastEntry extends Row {
  projectId: string;
  lineId: string;
  period: string; // YYYY-MM
  amount: number;
}

export interface Actual extends Row {
  projectId: string;
  wbsElement: string;
  period: string;
  category: 'Capital' | 'Expense';
  amount: number;
  docRef?: string;
  importedAt: string;
}

/** BRD-FR-003 requirement → test traceability. */
export interface Trace extends Row {
  projectId: string;
  testCaseId: string;
  requirementId: string;
}

/** Generic artifact row stored per project collection. */
export interface Rec {
  id: string;
  projectId: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  parentId?: string;
  order?: number;
  [key: string]: any;
}

export interface MasterData {
  businessAreas: string[];
  businessFunctions: string[];
  corporatePriorities: string[];
  benefitTypes: string[];
  roadmapOptions: string[];
  pillars: string[];
  programs: string[];
  applications: string[];
  categories: string[];
  specialties: string[];
  spendCategories: string[];
  hoursBuckets: string[];
}

export interface AppConfig {
  internalDomains: string[];
  gateApprovers: Record<GateKey, Role[]>;
  gateChecks: Record<string, string[]>;
  statusRequiredStages: Stage[];
  externalAccessMaxDays: number;
  expiryWarningDays: number;
  accessReviewIntervalDays: number;
  budgetTolerancePct: number;
  scheduleYellowDays: number;
  scheduleRedDays: number;
  resourceGapRedDays: number;
  workdaysOverride: Record<string, number>;
  masterData: MasterData;
  powerBiReportUrl: string;
}

export interface CheckResult {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
  artifact?: ArtifactKey;
}

export interface DB {
  config: AppConfig;
  users: User[];
  projects: Project[];
  gateReviews: GateReview[];
  exceptions: ExceptionRec[];
  accessGrants: AccessGrant[];
  ndaAccess: NdaAccess[];
  notifications: Notification[];
  auditEvents: AuditEvent[];
  settings: SettingsRow[];
  attachments: Attachment[];
  teams: Team[];
  resources: Resource[];
  assignments: Assignment[];
  scenarios: Scenario[];
  forecastEntries: ForecastEntry[];
  actuals: Actual[];
  traces: Trace[];
  stakeholders: Rec[];
  raci: Rec[];
  requirements: Rec[];
  tasks: Rec[];
  demands: Rec[];
  forecastLines: Rec[];
  costItems: Rec[];
  raidd: Rec[];
  testCases: Rec[];
  uatDefects: Rec[];
  cutoverTasks: Rec[];
  hypercareDefects: Rec[];
  statusUpdates: Rec[];
}
