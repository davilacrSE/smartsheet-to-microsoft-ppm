/**
 * Verifies the deployed Dataverse schema against src/data/model.ts by loading every table through the same
 * column mapping the code app uses, then running portfolio logic on the result.
 *   npx tsx scripts/verify-dataverse.ts
 */
import { execSync } from 'node:child_process';
import type { EntityName } from '../src/domain/types';
import { DIRECTORY, ENTITIES, entityDef, fromDataverse, selectColumns, toDataverse } from '../src/data/model';
import { ENTITY_NAMES, initStore, setActingUser, db, type Backend } from '../src/data/store';
import { dashboard, REPORTS } from '../src/services/reports';
import { visibleProjects } from '../src/services/rules';
import { BRAND } from '../src/brand';

const D = BRAND.emailDomain;

const ORG = (process.env.DATAVERSE_URL || '').replace(/\/$/, '');
if (!ORG) throw new Error('Set DATAVERSE_URL=https://<org>.crm.dynamics.com (see docs/deploy.md).');
const AZ_SCOPE = process.env.AZ_SUBSCRIPTION ? `--subscription ${process.env.AZ_SUBSCRIPTION}` : process.env.AZ_TENANT ? `--tenant ${process.env.AZ_TENANT}` : '';
const token = process.env.DATAVERSE_TOKEN || execSync(`az account get-access-token ${AZ_SCOPE} --resource ${ORG} --query accessToken -o tsv`, { encoding: 'utf8' }).trim();
const API = `${ORG}/api/data/v9.2`;
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-Version': '4.0', Prefer: 'odata.maxpagesize=5000' };

async function req(method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path.slice(0, 120)} -> ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

class RestBackend implements Backend {
  mode = 'dataverse' as const;
  async loadAll() {
    const out: Partial<Record<EntityName, any[]>> = {};
    for (const e of ENTITY_NAMES) {
      const def = entityDef(e);
      let url: string | undefined = `/${def.set}?$select=${selectColumns(e).join(',')}`;
      const rows: any[] = [];
      while (url) {
        const res: any = await req('GET', url);
        rows.push(...res.value.map((r: any) => fromDataverse(e, r)));
        url = res['@odata.nextLink']?.replace(API, '');
      }
      out[e] = rows;
    }
    return out;
  }
  async create(entity: EntityName, rec: Record<string, any>) {
    const def = entityDef(entity);
    await req('POST', `/${def.set}`, { ...toDataverse(entity, rec, true), [def.pk]: rec.id });
    return { id: rec.id };
  }
  async update(entity: EntityName, id: string, changes: Record<string, any>) {
    await req('PATCH', `/${entityDef(entity).set}(${id})`, toDataverse(entity, changes, false));
  }
  async remove(entity: EntityName, id: string) {
    await req('DELETE', `/${entityDef(entity).set}(${id})`);
  }
  async signedInEmail() {
    return `elena.vasquez@${D}`;
  }
  async searchDirectory(q: string, top: number) {
    const query = new URLSearchParams({ $select: DIRECTORY.select.join(','), $filter: DIRECTORY.filter(q), $orderby: DIRECTORY.orderBy.join(','), $top: String(top) });
    return DIRECTORY.toPeople((await req('GET', `/${DIRECTORY.set}?${query}`)).value);
  }
  async uploadFile() {}
  async downloadFile() {
    return new Uint8Array();
  }
}

async function main() {
  const backend = new RestBackend();
  await initStore(backend);
  console.log(`Loaded from Dataverse via model mapping:`);
  for (const e of ENTITIES) console.log(`  ${e.table.padEnd(26)} ${String((db as any)[e.name].length).padStart(5)} rows`);
  const p = db.projects.find((x) => x.code === 'ITProj-26-001')!;
  console.log(`\nSample: ${p.code} "${p.name}" stage=${p.stage} brm=${db.users.find((u) => u.id === p.brmId)?.name} health=${p.healthOverall} wbs=${p.wbsElements.join(',')}`);
  const d = dashboard(db.users.find((u) => u.email === `elena.vasquez@${D}`)!);
  console.log(`Dashboard (PMO Director): active=${d.kpis.active} pendingGates=${d.kpis.pendingGates} red=${d.kpis.red} gaps=${d.kpis.gaps}`);
  setActingUser(db.users.find((u) => u.email === `victoria.hale@${D}`)!.id);
  const exec = db.users.find((u) => u.email === `victoria.hale@${D}`)!;
  console.log(`Executive sees ${visibleProjects(exec).length} projects (NDA hidden: ${!visibleProjects(exec).some((x) => x.ndaActive)})`);
  REPORTS.forEach((r) => r.build(exec));
  const people = await backend.searchDirectory('a', 10);
  console.log(`Directory search "a": ${people.map((x) => x.name).join(', ') || 'no people'}`);
  const assignable = (['tasks', 'raidd', 'testCases', 'uatDefects', 'cutoverTasks', 'hypercareDefects'] as const).map((c) => `${c} ${db[c].filter((r) => db.users.some((u) => u.id === r.assigneeId)).length}/${db[c].length}`);
  console.log(`Rows assigned to a PPM user: ${assignable.join(', ')}`);
  // write round-trip with lookup + csv + bool
  const id = crypto.randomUUID();
  await backend.create('notifications', { id, userId: exec.id, projectId: p.id, type: 'verify', title: 'Schema verification', body: 'Round-trip test', channels: ['email'], sentAt: new Date().toISOString(), read: false });
  await backend.update('notifications', id, { read: true, channels: ['email', 'teams'] });
  const back: any = await req('GET', `/${entityDef('notifications').set}(${id})?$select=${selectColumns('notifications').join(',')}`);
  const mapped = fromDataverse('notifications', back);
  console.log(`Round-trip notification: user=${mapped.userId === exec.id} read=${mapped.read} channels=${mapped.channels.join('+')}`);
  await backend.remove('notifications', id);
  console.log('Schema verification passed.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
