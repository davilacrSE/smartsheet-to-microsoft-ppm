import type { CollectionName } from './types';
import { BRAND } from '../brand';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'select'
  | 'checkbox'
  | 'user'
  | 'team'
  | 'requirementRefs'
  | 'testCaseRef'
  | 'health';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  /** options come from config.masterData[optionsFrom] */
  optionsFrom?: 'categories' | 'specialties' | 'spendCategories' | 'applications';
  required?: boolean;
  default?: unknown;
  table?: boolean; // show as a table column
  inline?: boolean; // editable directly in the table cell
  readOnly?: boolean; // system-managed
  width?: number;
  help?: string;
  /** text field holding a person's name: offers a directory people picker that also fills `emailKey` */
  person?: { emailKey: string };
}

export interface CollectionSchema {
  name: CollectionName;
  label: string;
  singular: string;
  fields: FieldDef[];
  hierarchical?: boolean;
  autoId?: { field: string; prefix: string | ((r: Record<string, unknown>) => string) };
}

const HEALTH = ['Green', 'Yellow', 'Red'] as const;
const PRIORITY_P = ['P1 - Critical', 'P2 - High', 'P3 - Medium', 'P4 - Low'] as const;
const DEFECT_STATUS = ['New', 'Open', 'In Progress', 'Fixed', 'Retest', 'Closed', 'Deferred', 'Rejected'] as const;
const DEFECT_TYPES = ['Configuration', 'Code', 'Data', 'Requirement Gap', 'Environment', 'Training', 'Other'] as const;
const RACI_VALUES = ['', 'R', 'A', 'C', 'I', 'A/R'] as const;

export const OPEN_DEFECT_STATUSES = ['New', 'Open', 'In Progress', 'Fixed', 'Retest'];

export const SCHEMAS: Record<CollectionName, CollectionSchema> = {
  stakeholders: {
    name: 'stakeholders',
    label: 'Stakeholder Register',
    singular: 'Stakeholder',
    fields: [
      { key: 'role', label: 'Stakeholder Role', type: 'text', required: true, table: true, width: 170 },
      { key: 'name', label: 'Stakeholder Name', type: 'text', person: { emailKey: 'email' }, required: true, table: true, width: 170 },
      { key: 'email', label: 'Email', type: 'text', table: true, width: 220 },
      { key: 'phone', label: 'Phone Number', type: 'text' },
      { key: 'company', label: 'Company', type: 'text', default: BRAND.company, table: true, width: 120 },
      { key: 'steerCo', label: 'SteerCo Member', type: 'checkbox', table: true, inline: true, width: 90 },
      { key: 'sourceInput', label: 'Source Input', type: 'select', options: ['PPM Intake', 'Stakeholder Register', 'Project Record'], default: 'Stakeholder Register' },
      { key: 'notes', label: 'Notes', type: 'textarea', table: true },
    ],
  },
  raci: {
    name: 'raci',
    label: 'Project RACI',
    singular: 'Deliverable',
    fields: [
      { key: 'deliverable', label: 'Project Deliverable / Activity', type: 'text', required: true, table: true, width: 240 },
      ...(
        [
          ['sponsor', 'Sponsor'],
          ['brm', 'BRM'],
          ['ba', 'BA'],
          ['itDeliveryLead', 'IT Delivery Lead'],
          ['pm', 'PM'],
          ['integrationLead', 'Integration Lead'],
          ['technicalLead', 'Technical Lead'],
          ['infrastructureLead', 'Infra Lead'],
          ['cyberLead', 'Cyber Lead'],
          ['insightsLead', 'Insights Lead'],
          ['applicationsLead', 'Apps Lead'],
          ['commsLead', 'Comms Lead'],
          ['businessSme', 'Business SME'],
        ] as const
      ).map(([key, label]) => ({ key, label, type: 'select' as const, options: RACI_VALUES, table: true, inline: true, width: 78 })),
    ],
  },
  requirements: {
    name: 'requirements',
    label: 'Business Requirements (BRD)',
    singular: 'Requirement',
    hierarchical: true,
    fields: [
      { key: 'title', label: 'Requirement', type: 'text', required: true, table: true, width: 320 },
      { key: 'reqType', label: 'Type', type: 'select', options: ['Business', 'Functional', 'Technical'], required: true, default: 'Functional', table: true, width: 100 },
      { key: 'priority', label: 'Priority', type: 'select', options: ['Must Have', 'Should Have', 'Could Have', "Won't Have"], default: 'Must Have', table: true, width: 110 },
      { key: 'status', label: 'Status', type: 'select', options: ['Proposed', 'In Progress', 'Implemented', 'Verified', 'Deferred'], default: 'Proposed', table: true, inline: true, width: 120 },
      { key: 'approvalState', label: 'Approval', type: 'select', options: ['Pending', 'Approved', 'Rejected'], default: 'Pending', table: true, inline: true, width: 110 },
      { key: 'owner', label: 'Owner', type: 'user', table: true, width: 140 },
      { key: 'tags', label: 'Tags', type: 'text', help: 'Comma separated, e.g. RBS area, process, application' },
      { key: 'source', label: 'Source', type: 'text', default: 'Requirements workshop' },
      { key: 'description', label: 'Description / User Story', type: 'textarea' },
      { key: 'acceptanceCriteria', label: 'Acceptance Criteria', type: 'textarea' },
      { key: 'estQuantBenefit', label: 'Est. Quantitative Benefit', type: 'currency' },
      { key: 'estCost', label: 'Est. Cost of Deliverable', type: 'currency' },
    ],
  },
  tasks: {
    name: 'tasks',
    label: 'Project Plan',
    singular: 'Task',
    hierarchical: true,
    fields: [
      { key: 'name', label: 'Task', type: 'text', required: true, table: true, width: 300 },
      { key: 'taskType', label: 'Type', type: 'select', options: ['Phase', 'Task', 'Milestone', 'Gate'], default: 'Task', table: true, width: 90 },
      { key: 'status', label: 'Status', type: 'select', options: ['Not Started', 'In Progress', 'Complete', 'Blocked', 'Not Required'], default: 'Not Started', table: true, inline: true, width: 120 },
      { key: 'assigneeId', label: 'Assigned To', type: 'user', table: true, width: 160 },
      { key: 'start', label: 'Start', type: 'date', table: true, width: 105 },
      { key: 'end', label: 'Finish (Forecast)', type: 'date', table: true, width: 105 },
      { key: 'baselineStart', label: 'Baseline Start', type: 'date' },
      { key: 'baselineEnd', label: 'Baseline Finish', type: 'date', table: true, width: 105 },
      { key: 'pctComplete', label: '% Complete', type: 'percent', default: 0, table: true, width: 85 },
      { key: 'effortHours', label: 'Effort (hrs)', type: 'number' },
      { key: 'predecessors', label: 'Predecessors', type: 'text', help: 'WBS numbers, comma separated' },
      { key: 'notes', label: 'Latest Comment', type: 'textarea' },
    ],
  },
  demands: {
    name: 'demands',
    label: 'Resource Estimator / Demand',
    singular: 'Resource demand',
    fields: [
      { key: 'placeholder', label: 'Role / Placeholder', type: 'text', required: true, table: true, width: 190, help: 'e.g. "SAP FI Architect (TBD)" until a named resource is confirmed' },
      { key: 'category', label: 'Category / Labor Area', type: 'select', optionsFrom: 'categories', required: true, table: true, width: 130 },
      { key: 'specialty', label: 'Specialty', type: 'select', optionsFrom: 'specialties', required: true, table: true, width: 130 },
      { key: 'teamId', label: 'Team', type: 'team', required: true, table: true, width: 200 },
      { key: 'resourceType', label: 'Resource Type', type: 'select', options: ['Internal', 'External', 'Staff Augmentation'], default: 'Internal', required: true, table: true, width: 110 },
      { key: 'expenseCategory', label: 'Expense Category', type: 'select', options: ['Capital', 'Expense'], default: 'Expense', required: true },
      { key: 'organization', label: 'Organization (if external)', type: 'text' },
      { key: 'application', label: 'Application', type: 'select', optionsFrom: 'applications' },
      { key: 'startDate', label: 'Start', type: 'date', required: true, table: true, width: 105 },
      { key: 'endDate', label: 'End', type: 'date', required: true, table: true, width: 105 },
      { key: 'hours', label: 'Hours', type: 'number', required: true, table: true, width: 80 },
      { key: 'rate', label: 'Average Rate (USD)', type: 'currency', default: 85 },
      { key: 'status', label: 'Nomination', type: 'select', options: ['Requested', 'Nominated', 'Confirmed', 'Rejected', 'Gap', 'Cancelled'], default: 'Requested', readOnly: true, table: true, width: 110 },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  forecastLines: {
    name: 'forecastLines',
    label: 'Budget & Forecast',
    singular: 'Forecast line',
    fields: [
      { key: 'description', label: 'Description', type: 'text', required: true, table: true, width: 240 },
      { key: 'category', label: 'Capital / Expense', type: 'select', options: ['Capital', 'Expense'], required: true, default: 'Expense', table: true, width: 100 },
      { key: 'spendCategory', label: 'Spend Category', type: 'select', optionsFrom: 'spendCategories', required: true, table: true, width: 130 },
      { key: 'approvedBudget', label: 'Approved Budget', type: 'currency', default: 0, table: true, width: 120 },
      { key: 'wbsElement', label: 'WBS Element', type: 'text', table: true, width: 110, help: 'Available after ACT approval (FIN-FR-002)' },
      { key: 'poNumber', label: 'PO Number', type: 'text', table: true, width: 110, help: 'Available after ACT approval (FIN-FR-002)' },
    ],
  },
  costItems: {
    name: 'costItems',
    label: 'Cost Estimator',
    singular: 'Cost line',
    hierarchical: true,
    fields: [
      { key: 'itCategory', label: 'IT Category', type: 'text', required: true, table: true, width: 260 },
      { key: 'expenseCategory', label: 'CAPEX / OPEX', type: 'select', options: ['CAPEX', 'OPEX'], table: true, width: 90 },
      { key: 'laborRow', label: 'Labor', type: 'select', options: ['', 'Internal Labor', 'External Labor'] },
      { key: 'glCode', label: 'G/L', type: 'text' },
      { key: 'costCenter', label: 'Cost Center', type: 'text' },
      { key: 'qty', label: 'Qty', type: 'number', table: true, inline: true, width: 80 },
      { key: 'unitCost', label: 'Avg. Cost per Unit', type: 'currency', table: true, inline: true, width: 120 },
      { key: 'unitOfMeasure', label: 'Unit of Measure', type: 'text' },
      { key: 'arrHardware', label: 'Hardware / Licenses (ARR)', type: 'currency', inline: true },
      { key: 'arrSupport', label: 'Support Services (ARR)', type: 'currency', inline: true },
    ],
  },
  raidd: {
    name: 'raidd',
    label: 'RAIDD Log',
    singular: 'RAIDD item',
    autoId: { field: 'raiddId', prefix: 'RAIDD' },
    fields: [
      { key: 'raiddId', label: 'RAIDD ID', type: 'text', readOnly: true, table: true, width: 90 },
      { key: 'type', label: 'Entry Type', type: 'select', options: ['Risk', 'Action', 'Issue', 'Decision', 'Dependency', 'Assumption', 'Change Request'], required: true, default: 'Risk', table: true, width: 120 },
      { key: 'title', label: 'Title', type: 'text', required: true, table: true, width: 260 },
      { key: 'assigneeId', label: 'Owner', type: 'user', required: true, table: true, width: 150 },
      { key: 'dueDate', label: 'Target Resolution', type: 'date', required: true, table: true, width: 110 },
      { key: 'status', label: 'Status', type: 'select', options: ['Open', 'In Progress', 'Closed', 'Cancelled'], default: 'Open', required: true, table: true, inline: true, width: 110 },
      { key: 'severity', label: 'Severity', type: 'select', options: ['1-Critical', '2-High', '3-Medium', '4-Low'], default: '3-Medium', required: true, table: true, width: 100 },
      { key: 'priority', label: 'Priority', type: 'select', options: ['1-Critical', '2-High', '3-Medium', '4-Low'], default: '3-Medium', required: true },
      { key: 'execReporting', label: 'Exec Reporting', type: 'checkbox', table: true, inline: true, width: 80 },
      { key: 'escalated', label: 'Escalated', type: 'checkbox', table: true, inline: true, width: 80, help: 'Escalate when a leadership decision is required (RAIDD-FR-003)' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'impact', label: 'Impact', type: 'textarea' },
      { key: 'mitigation', label: 'Mitigation / Action Plan', type: 'textarea' },
      { key: 'askToLeadership', label: 'Ask to Leadership', type: 'textarea' },
      { key: 'resolution', label: 'Resolution', type: 'textarea' },
    ],
  },
  testCases: {
    name: 'testCases',
    label: 'UAT Test Plan',
    singular: 'Test case',
    autoId: { field: 'ref', prefix: 'TC' },
    fields: [
      { key: 'ref', label: 'Ref#', type: 'text', readOnly: true, table: true, width: 80 },
      { key: 'title', label: 'Title', type: 'text', required: true, table: true, width: 240 },
      { key: 'category', label: 'Category', type: 'select', options: ['UAT', 'SIT', 'IT', 'Regression'], default: 'UAT', table: true, width: 80 },
      { key: 'requirementIds', label: 'Traces to Requirements', type: 'requirementRefs', table: true, width: 150 },
      { key: 'importance', label: 'Go/No-Go Importance', type: 'select', options: ['Critical', 'High', 'Medium', 'Low'], default: 'High', table: true, width: 100 },
      { key: 'assigneeId', label: 'Assigned To', type: 'user', table: true, width: 150 },
      { key: 'result', label: 'Result', type: 'select', options: ['Not Run', 'Passed', 'Failed', 'Blocked', 'N/A'], default: 'Not Run', table: true, inline: true, width: 100 },
      { key: 'testedDate', label: 'Tested (Date)', type: 'date', table: true, width: 105 },
      { key: 'application', label: 'Application', type: 'select', optionsFrom: 'applications' },
      { key: 'functionalArea', label: 'Functional Area', type: 'text' },
      { key: 'process', label: 'Process', type: 'text' },
      { key: 'scenario', label: 'Action / Scenario Details', type: 'textarea' },
      { key: 'expectedResults', label: 'Expected Results', type: 'textarea' },
      { key: 'actualResults', label: 'Actual Results', type: 'textarea' },
      { key: 'evidence', label: 'Evidence / Document #', type: 'text' },
    ],
  },
  uatDefects: {
    name: 'uatDefects',
    label: 'UAT Defect Tracker',
    singular: 'UAT defect',
    autoId: { field: 'defectNo', prefix: 'UAT' },
    fields: [
      { key: 'defectNo', label: 'Defect#', type: 'text', readOnly: true, table: true, width: 85 },
      { key: 'title', label: 'Short Description', type: 'text', required: true, table: true, width: 250 },
      { key: 'testCaseId', label: 'Test Plan Reference', type: 'testCaseRef', table: true, width: 110 },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY_P, default: 'P3 - Medium', required: true, table: true, width: 110 },
      { key: 'status', label: 'Status', type: 'select', options: DEFECT_STATUS, default: 'New', required: true, table: true, inline: true, width: 110 },
      { key: 'assigneeId', label: 'Defect Owner', type: 'user', table: true, width: 150 },
      { key: 'module', label: 'Module', type: 'text' },
      { key: 'defectType', label: 'Defect Type', type: 'select', options: DEFECT_TYPES },
      { key: 'impactRegion', label: 'Impact Region(s)', type: 'text' },
      { key: 'description', label: 'Additional Comments', type: 'textarea' },
      { key: 'resolution', label: 'Resolution Details', type: 'textarea' },
      { key: 'dateFixed', label: 'Date Fixed', type: 'date', table: true, width: 105 },
    ],
  },
  cutoverTasks: {
    name: 'cutoverTasks',
    label: 'Cutover Plan',
    singular: 'Cutover task',
    autoId: { field: 'taskId', prefix: 'CO' },
    fields: [
      { key: 'taskId', label: 'Task ID', type: 'text', readOnly: true, table: true, width: 75 },
      { key: 'focusArea', label: 'Focus Area', type: 'select', options: ['Pre-Cutover', 'Cutover Execution', 'Post-Cutover', 'Rollback'], default: 'Pre-Cutover', required: true, table: true, width: 130 },
      { key: 'taskName', label: 'Task Name', type: 'text', required: true, table: true, width: 260 },
      { key: 'taskType', label: 'Task Type', type: 'select', options: ['Technical', 'Business', 'Data', 'Communication', 'Validation'], default: 'Technical', table: true, width: 110 },
      { key: 'assigneeId', label: 'Assigned To', type: 'user', table: true, width: 150 },
      { key: 'status', label: 'Status', type: 'select', options: ['Not Started', 'In Progress', 'Complete', 'Blocked', 'N/A'], default: 'Not Started', table: true, inline: true, width: 110 },
      { key: 'start', label: 'Start (CST)', type: 'datetime', table: true, width: 150 },
      { key: 'end', label: 'Completion (CST)', type: 'datetime', table: true, width: 150 },
      { key: 'organization', label: 'Organization', type: 'text' },
      { key: 'predecessors', label: 'Predecessors', type: 'text' },
      { key: 'notes', label: 'Comments / Notes', type: 'textarea' },
    ],
  },
  hypercareDefects: {
    name: 'hypercareDefects',
    label: 'Hypercare Defect Tracker',
    singular: 'Hypercare defect',
    autoId: { field: 'defectNo', prefix: 'HC' },
    fields: [
      { key: 'defectNo', label: 'Defect#', type: 'text', readOnly: true, table: true, width: 80 },
      { key: 'title', label: 'Short Description', type: 'text', required: true, table: true, width: 240 },
      { key: 'reportedBy', label: 'Reported By', type: 'text', person: { emailKey: 'reportedByEmail' }, table: true, width: 130 },
      { key: 'reportedByEmail', label: 'Reported By Email', type: 'text' },
      { key: 'application', label: 'Application', type: 'select', optionsFrom: 'applications', table: true, width: 130 },
      { key: 'businessFunction', label: 'Business Function', type: 'text' },
      { key: 'impactRegion', label: 'Impact Region(s)', type: 'text' },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY_P, default: 'P3 - Medium', required: true, table: true, width: 110 },
      { key: 'status', label: 'Status', type: 'select', options: DEFECT_STATUS, default: 'New', required: true, table: true, inline: true, width: 110 },
      { key: 'assigneeId', label: 'Assigned To', type: 'user', table: true, width: 150 },
      { key: 'organization', label: 'Organization', type: 'text' },
      { key: 'defectType', label: 'Defect Type', type: 'select', options: DEFECT_TYPES },
      { key: 'description', label: 'Additional Comments', type: 'textarea' },
      { key: 'resolution', label: 'Resolution Details – Information to Requestor', type: 'textarea' },
      { key: 'dateFixed', label: 'Date Fixed', type: 'date', table: true, width: 105 },
    ],
  },
  statusUpdates: {
    name: 'statusUpdates',
    label: 'Weekly Status',
    singular: 'Status update',
    fields: [
      { key: 'statusDate', label: 'Status Date', type: 'date', required: true, table: true, width: 105 },
      { key: 'scope', label: 'Scope Health', type: 'health', options: HEALTH, required: true, table: true, width: 85 },
      { key: 'schedule', label: 'Schedule Health', type: 'health', options: HEALTH, required: true, table: true, width: 85 },
      { key: 'resource', label: 'Resource Health', type: 'health', options: HEALTH, required: true, table: true, width: 85 },
      { key: 'budget', label: 'Budget Health', type: 'health', options: HEALTH, required: true, table: true, width: 85 },
      { key: 'overall', label: 'Overall Health', type: 'health', options: HEALTH, readOnly: true, table: true, width: 85, help: 'Calculated: Red if any component is Red or Yellow; Green only when all are Green (STAT-FR-004)' },
      { key: 'executiveSummary', label: 'Executive Summary', type: 'textarea', required: true, table: true },
      { key: 'accomplishments', label: 'Accomplishments Last Period', type: 'textarea', required: true },
      { key: 'nextSteps', label: 'Key Tasks Next Period', type: 'textarea', required: true },
      { key: 'risks', label: 'Risks', type: 'textarea' },
      { key: 'issues', label: 'Issues', type: 'textarea' },
      { key: 'decisions', label: 'Decisions', type: 'textarea' },
      { key: 'helpNeeded', label: 'Help Needed', type: 'textarea' },
      { key: 'pathToGreen', label: 'Path to Green', type: 'textarea' },
    ],
  },
};

export const COLLECTIONS = Object.keys(SCHEMAS) as CollectionName[];
