/**
 * Provisions the PPM Dataverse solution from src/data/model.ts. Publisher, table prefix and solution names
 * come from src/brand.ts.
 *
 *   npm run dataverse:plan                       # print what would be created
 *   npm run dataverse:provision                  # create publisher, solution, tables, columns, relationships
 *   npm run dataverse:provision -- --seed        # ...and load sample data
 *
 * Environment variables
 *   DATAVERSE_URL      https://<org>.crm.dynamics.com (required, except with --plan)
 *   AZ_SUBSCRIPTION    optional Azure CLI subscription in the Dataverse tenant used to obtain a token
 *   AZ_TENANT          optional tenant id, when the signed-in Azure CLI account has no subscription there
 *   DATAVERSE_TOKEN    optional pre-acquired bearer token (skips Azure CLI)
 *   PPM_ADMIN_EMAIL    email of the first PPM administrator profile (default: the signed-in user)
 *
 * The script is idempotent: existing tables, columns and relationships are skipped.
 */
import { execSync } from 'node:child_process';
import { ENTITIES, PREFIX, PUBLISHER, SOLUTION, entityDef, toDataverse, type ColDef, type EntityDef } from '../src/data/model';
import { DEFAULT_CONFIG } from '../src/domain/constants';
import { BRAND } from '../src/brand';
import type { EntityName } from '../src/domain/types';

const ORG = (process.env.DATAVERSE_URL || '').replace(/\/$/, '');
const AZ_SCOPE = process.env.AZ_SUBSCRIPTION ? `--subscription ${process.env.AZ_SUBSCRIPTION}` : process.env.AZ_TENANT ? `--tenant ${process.env.AZ_TENANT}` : '';
const API = `${ORG}/api/data/v9.2`;
const PLAN = process.argv.includes('--plan');
const SEED = process.argv.includes('--seed');

let token = process.env.DATAVERSE_TOKEN || '';
let tokenAt = 0;
function getToken(): string {
  if (process.env.DATAVERSE_TOKEN) return token;
  if (!token || Date.now() - tokenAt > 30 * 60_000) {
    token = execSync(`az account get-access-token ${AZ_SCOPE} --resource ${ORG} --query accessToken -o tsv`, { encoding: 'utf8' }).trim();
    tokenAt = Date.now();
  }
  return token;
}

let solutionReady = false;

async function call(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(path.startsWith('http') ? path : API + path, {
      method,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        // New components are added to the solution once it exists.
        ...(solutionReady ? { 'MSCRM.SolutionUniqueName': SOLUTION.uniqueName } : {}),
        Prefer: 'return=representation',
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 404 && method === 'GET') return null;
    const text = await res.text();
    if (res.ok) return text ? JSON.parse(text) : {};
    // Metadata operations serialize per org; retry when another customization holds the lock.
    if ((res.status === 429 || /another \[|CustomizationLock|0x80071151|try again/i.test(text)) && attempt < 8) {
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
      continue;
    }
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 800)}`);
  }
}

const label = (text: string) => ({
  '@odata.type': 'Microsoft.Dynamics.CRM.Label',
  LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }],
});
const required = { Value: 'None', CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyrequirementlevelsettings' };

function attributeMetadata(col: ColDef): Record<string, unknown> {
  const base = { SchemaName: col.col, DisplayName: label(col.label), Description: label(col.label), RequiredLevel: required };
  switch (col.type) {
    case 'memo':
    case 'json':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata', ...base, Format: 'TextArea', MaxLength: col.max ?? 20000 };
    case 'decimal':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata', ...base, Precision: 2, MinValue: -100000000000, MaxValue: 100000000000 };
    case 'int':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata', ...base, Format: 'None', MinValue: -2147483648, MaxValue: 2147483647 };
    case 'bool':
      return {
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
        ...base,
        DefaultValue: false,
        OptionSet: { TrueOption: { Value: 1, Label: label('Yes') }, FalseOption: { Value: 0, Label: label('No') }, OptionSetType: 'Boolean' },
      };
    case 'date':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', ...base, Format: 'DateOnly', DateTimeBehavior: { Value: 'DateOnly' } };
    case 'datetime':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', ...base, Format: 'DateAndTime', DateTimeBehavior: { Value: 'UserLocal' } };
    case 'wallclock':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata', ...base, Format: 'DateAndTime', DateTimeBehavior: { Value: 'TimeZoneIndependent' } };
    case 'file':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.FileAttributeMetadata', ...base, MaxSizeInKB: 32768 };
    case 'ref':
      return { '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', ...base, MaxLength: 100, FormatName: { Value: 'Text' } };
    default: {
      const s: Record<string, unknown> = { '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata', ...base, MaxLength: col.max ?? 400, FormatName: { Value: 'Text' } };
      if (col.autoNumber) s.AutoNumberFormat = col.autoNumber;
      return s;
    }
  }
}

function entityMetadata(e: EntityDef) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: e.table,
    DisplayName: label(e.display),
    DisplayCollectionName: label(e.plural),
    Description: label(e.description),
    OwnershipType: e.ownership,
    IsActivity: false,
    HasActivities: false,
    HasNotes: e.name === 'projects',
    IsAuditEnabled: { Value: true, CanBeChanged: true, ManagedPropertyLogicalName: 'canmodifyauditsettings' },
    Attributes: [
      {
        '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
        SchemaName: PREFIX + 'name',
        IsPrimaryName: true,
        MaxLength: e.primary.max,
        FormatName: { Value: 'Text' },
        RequiredLevel: required,
        DisplayName: label(e.primary.label),
        Description: label(e.primary.label),
      },
    ],
  };
}

const PARENTAL = { Assign: 'Cascade', Delete: 'Cascade', Merge: 'NoCascade', Reparent: 'Cascade', Share: 'Cascade', Unshare: 'Cascade', RollupView: 'NoCascade' };
const REFERENTIAL = { Assign: 'NoCascade', Delete: 'RemoveLink', Merge: 'NoCascade', Reparent: 'NoCascade', Share: 'NoCascade', Unshare: 'NoCascade', RollupView: 'NoCascade' };

function relationshipMetadata(e: EntityDef, col: ColDef) {
  const target = entityDef(col.target!);
  const schema = `${e.table}_${col.col.slice(PREFIX.length)}`.slice(0, 90);
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: schema,
    ReferencedEntity: target.table,
    ReferencedAttribute: target.pk,
    ReferencingEntity: e.table,
    ReferencedEntityNavigationPropertyName: schema,
    ReferencingEntityNavigationPropertyName: col.col,
    CascadeConfiguration: col.parental ? PARENTAL : REFERENTIAL,
    AssociatedMenuConfiguration: { Behavior: 'UseCollectionName', Group: 'Details', Label: label(e.plural), Order: 10000 },
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: col.col,
      DisplayName: label(col.label),
      Description: label(col.label),
      RequiredLevel: required,
    },
  };
}

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function ensurePublisherAndSolution() {
  // Reuse any publisher that already owns the prefix; otherwise create ours.
  const pubs = await call('GET', `/publishers?$select=publisherid,uniquename,customizationprefix&$filter=customizationprefix eq '${PUBLISHER.prefix}'`);
  let pub = pubs.value[0];
  const clash = await call('GET', `/publishers?$select=customizationprefix&$filter=uniquename eq '${PUBLISHER.uniqueName}'`);
  if (!pub && clash.value[0]) throw new Error(`Publisher ${PUBLISHER.uniqueName} exists with prefix ${clash.value[0].customizationprefix}; choose another publisher unique name.`);
  if (!pub) {
    log(`Creating publisher ${PUBLISHER.uniqueName} (prefix ${PUBLISHER.prefix})`);
    pub = await call('POST', '/publishers', {
      uniquename: PUBLISHER.uniqueName,
      friendlyname: PUBLISHER.displayName,
      customizationprefix: PUBLISHER.prefix,
      customizationoptionvalueprefix: PUBLISHER.optionValuePrefix,
      description: `${PUBLISHER.displayName} publisher`,
    });
  } else log(`Publisher ${pub.uniquename} exists (prefix ${pub.customizationprefix})`);
  const sols = await call('GET', `/solutions?$select=solutionid,uniquename&$filter=uniquename eq '${SOLUTION.uniqueName}'`);
  if (!sols.value[0]) {
    log(`Creating solution ${SOLUTION.uniqueName}`);
    await call('POST', '/solutions', {
      uniquename: SOLUTION.uniqueName,
      friendlyname: SOLUTION.displayName,
      version: SOLUTION.version,
      'publisherid@odata.bind': `/publishers(${pub.publisherid})`,
      description: 'IT Project & Portfolio Management – Dataverse tables for the PPM code app.',
    });
  } else log(`Solution ${SOLUTION.uniqueName} exists`);
  solutionReady = true;
}

async function existingAttributes(table: string): Promise<Set<string>> {
  const r = await call('GET', `/EntityDefinitions(LogicalName='${table}')/Attributes?$select=LogicalName`);
  return new Set((r?.value || []).map((a: any) => a.LogicalName));
}

async function provisionTables() {
  const created: string[] = [];
  for (const e of ENTITIES) {
    const meta = await call('GET', `/EntityDefinitions(LogicalName='${e.table}')?$select=LogicalName,EntitySetName`);
    if (!meta) {
      log(`Creating table ${e.table} (${e.display})`);
      await call('POST', '/EntityDefinitions', entityMetadata(e));
      created.push(e.table);
    }
    const check = await call('GET', `/EntityDefinitions(LogicalName='${e.table}')?$select=EntitySetName`);
    if (check.EntitySetName !== e.set) throw new Error(`Entity set mismatch for ${e.table}: Dataverse=${check.EntitySetName} model=${e.set}`);
    const have = await existingAttributes(e.table);
    for (const col of e.cols.filter((c) => c.type !== 'lookup')) {
      if (have.has(col.col)) continue;
      log(`  + ${e.table}.${col.col} (${col.type})`);
      await call('POST', `/EntityDefinitions(LogicalName='${e.table}')/Attributes`, attributeMetadata(col));
    }
  }
  // Relationships after every table exists.
  for (const e of ENTITIES) {
    const have = await existingAttributes(e.table);
    for (const col of e.cols.filter((c) => c.type === 'lookup')) {
      if (have.has(col.col)) continue;
      log(`  ↳ ${e.table}.${col.col} → ${entityDef(col.target!).table}${col.parental ? ' (parental)' : ''}`);
      await call('POST', '/RelationshipDefinitions', relationshipMetadata(e, col));
    }
  }
  if (created.includes(entityDef('projects').table)) {
    log('Seeding Project ID autonumber (ITProj-YY-001)');
    await call('POST', '/SetAutoNumberSeed', { EntityName: entityDef('projects').table, AttributeName: entityDef('projects').cols.find((c) => c.autoNumber)!.col, Value: 1 });
  }
  log('Publishing customizations…');
  await call('POST', '/PublishAllXml', {});
}

/**
 * Security roles. Business rules (segregation of duties, gate checks, NDA visibility) are applied by the app;
 * the roles grant table access. Audit events are create + read only for standard users, so the business audit
 * trail cannot be edited or deleted outside administration (GOV-FR-005, AUD-FR-004).
 */
const ROLES = [
  { name: `${BRAND.appName} User`, description: `Standard ${BRAND.appName} user (BRM, PM, BA, PMO, Finance, RTM, Pillar Lead, Executive).`, admin: false },
  { name: `${BRAND.appName} Administrator`, description: `${BRAND.appName} system administrator: settings, user profiles, master data.`, admin: true },
];

async function provisionRoles() {
  const who = await call('GET', '/WhoAmI');
  const bu = who.BusinessUnitId;
  const privs: { privilegeid: string; name: string }[] = [];
  let url: string | undefined = `/privileges?$select=privilegeid,name&$filter=contains(name,'${PREFIX}')`;
  while (url) {
    const r: any = await call('GET', url);
    privs.push(...r.value);
    url = r['@odata.nextLink'];
  }
  const readOnlyForUsers = new Set([entityDef('settings').table, entityDef('users').table]);
  const audit = entityDef('auditEvents').table;
  for (const role of ROLES) {
    const found = await call('GET', `/roles?$select=roleid&$filter=name eq '${role.name}' and _businessunitid_value eq ${bu}`);
    let roleId = found.value[0]?.roleid;
    if (!roleId) {
      log(`Creating security role ${role.name}`);
      const created = await call('POST', '/roles', { name: role.name, description: role.description, 'businessunitid@odata.bind': `/businessunits(${bu})` });
      roleId = created.roleid;
    } else log(`Security role ${role.name} exists – refreshing privileges`);
    const grant = privs
      .filter((p) => ENTITIES.some((e) => p.name.toLowerCase().endsWith(e.table)))
      .filter((p) => {
        const table = ENTITIES.find((e) => p.name.toLowerCase().endsWith(e.table))!.table;
        const op = p.name.slice(3, p.name.length - table.length); // prv<Op><table>
        if (role.admin) return true;
        if (table === audit) return ['Read', 'Create', 'Append', 'AppendTo'].includes(op);
        if (readOnlyForUsers.has(table)) return ['Read', 'AppendTo', ...(table === entityDef('users').table ? ['Create'] : [])].includes(op);
        return !['Assign', 'Share'].includes(op) || role.admin;
      })
      .map((p) => ({ PrivilegeId: p.privilegeid, Depth: 'Global', BusinessUnitId: bu }));
    await call('POST', `/roles(${roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, { Privileges: grant });
    log(`  ${grant.length} privileges granted on ${ENTITIES.length} tables`);
  }
}

async function upsertRow(name: EntityName, rec: Record<string, any>) {
  const def = entityDef(name);
  const body = toDataverse(name, rec, true);
  if (rec.id) body[def.pk] = rec.id;
  const auto = def.cols.find((c) => c.autoNumber);
  if (auto && rec[auto.key]) body[auto.col] = rec[auto.key];
  const exists = rec.id ? await call('GET', `/${def.set}(${rec.id})?$select=${def.pk}`) : null;
  if (exists) return call('PATCH', `/${def.set}(${rec.id})`, toDataverse(name, rec, false));
  return call('POST', `/${def.set}`, body);
}

async function seedBaseline() {
  const who = await call('GET', '/WhoAmI');
  const me = await call('GET', `/systemusers(${who.UserId})?$select=fullname,internalemailaddress,domainname`);
  const email = (process.env.PPM_ADMIN_EMAIL || me.internalemailaddress || me.domainname).toLowerCase();
  const settings = entityDef('settings');
  const existing = await call('GET', `/${settings.set}?$select=${settings.pk}&$top=1`);
  if (!existing.value.length) {
    log('Creating default PPM settings row');
    // Internal domain = the administrator's own domain (plus the sample personas' domain when seeding demo data).
    const internalDomains = [...new Set([email.split('@')[1], ...(SEED ? [BRAND.emailDomain] : [])].filter(Boolean))];
    await upsertRow('settings', { name: 'Default', configJson: { ...DEFAULT_CONFIG, internalDomains } });
  }
  const users = entityDef('users');
  const found = await call('GET', `/${users.set}?$select=${users.pk}&$filter=${PREFIX}email eq '${email}'`);
  if (!found.value.length) {
    log(`Creating PPM administrator profile for ${email}`);
    await upsertRow('users', {
      name: me.fullname || email,
      email,
      title: 'PPM Administrator',
      roles: ['SYS_ADMIN', 'PMO_DIRECTOR', 'PMO_ADMIN', 'BRM', 'PM', 'FINANCE', 'RTM'],
      external: false,
      active: true,
      notifyEmail: true,
      notifyTeams: true,
    });
  }
  return email;
}

async function seedSample(adminEmail: string) {
  const { buildSeed, SEED_ORDER } = await import('../src/data/seed');
  const data = buildSeed(new Date(), adminEmail);
  const pool = async <T,>(items: T[], n: number, fn: (t: T) => Promise<unknown>) => {
    let i = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
  };
  for (const name of SEED_ORDER) {
    let rows = (data as any)[name] as Record<string, any>[];
    if (!rows?.length) continue;
    if (name === 'settings') continue;
    log(`Seeding ${rows.length} ${name}`);
    // Hierarchical tables: parents before children.
    const depth = (r: any): number => (r.parentId ? 1 + depth(rows.find((x) => x.id === r.parentId) || {}) : 0);
    const levels = [...new Set(rows.map(depth))].sort();
    for (const lv of levels) await pool(rows.filter((r) => depth(r) === lv), 8, (r) => upsertRow(name, r));
  }
  const projects = entityDef('projects');
  const maxSeq = Math.max(...data.projects.map((p: any) => Number(String(p.code).split('-').pop())));
  await call('POST', '/SetAutoNumberSeed', { EntityName: projects.table, AttributeName: projects.cols.find((c) => c.autoNumber)!.col, Value: maxSeq + 1 });
}

async function main() {
  log(`Target: ${ORG || '(plan only)'}  solution: ${SOLUTION.uniqueName}  prefix: ${PREFIX}  tables: ${ENTITIES.length}`);
  if (PLAN) {
    for (const e of ENTITIES) {
      console.log(`\n${e.table}  [${e.set}]  ${e.display} – ${e.ownership}`);
      for (const c of e.cols) console.log(`   ${c.col.padEnd(42)} ${c.type}${c.target ? ' → ' + entityDef(c.target).table : ''}${c.parental ? ' (parental)' : ''}`);
    }
    const lookups = ENTITIES.flatMap((e) => e.cols.filter((c) => c.type === 'lookup')).length;
    console.log(`\n${ENTITIES.length} tables, ${ENTITIES.reduce((s, e) => s + e.cols.length + 1, 0)} columns, ${lookups} relationships`);
    return;
  }
  if (!ORG) throw new Error('Set DATAVERSE_URL=https://<org>.crm.dynamics.com (see docs/deploy.md).');
  const who = await call('GET', '/WhoAmI');
  log(`Connected as user ${who.UserId}`);
  await ensurePublisherAndSolution();
  await provisionTables();
  await provisionRoles();
  const adminEmail = await seedBaseline();
  if (SEED) await seedSample(adminEmail);
  log('Done.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
