import { getClient } from '@microsoft/power-apps/data';
import { getContext } from '@microsoft/power-apps/app';
import type { EntityName } from '../domain/types';
import type { Backend } from './store';
import { ENTITY_NAMES } from './store';
import { DIRECTORY, entityDef, fromDataverse, selectColumns, toDataverse } from './model';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

/**
 * Dataverse backend for the Power Apps code app. Uses the Power Apps client library, which runs every call
 * as the signed-in user — Dataverse security roles and row ownership (NDA owner teams) decide what is returned.
 */
export class DataverseBackend implements Backend {
  mode = 'dataverse' as const;
  private client = getClient(dataSourcesInfo);

  private fail(op: string, entity: EntityName, error: unknown): never {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Dataverse ${op} on ${entityDef(entity).display} failed: ${msg}`);
  }

  private async loadEntity(entity: EntityName): Promise<any[]> {
    const def = entityDef(entity);
    const rows: any[] = [];
    let skipToken: string | undefined;
    do {
      const res = await this.client.retrieveMultipleRecordsAsync<Record<string, any>>(def.set, { select: selectColumns(entity), maxPageSize: 5000, skipToken });
      if (!res.success) this.fail('read', entity, res.error);
      rows.push(...(res.data || []).map((r) => fromDataverse(entity, r)));
      skipToken = res.skipToken;
    } while (skipToken);
    return rows;
  }

  async loadAll() {
    const out: Partial<Record<EntityName, any[]>> = {};
    const names = [...ENTITY_NAMES];
    // A handful of parallel readers keeps start-up fast without tripping service protection limits.
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (names.length) {
          const e = names.shift()!;
          out[e] = await this.loadEntity(e);
        }
      }),
    );
    return out;
  }

  async create(entity: EntityName, rec: Record<string, any>) {
    const def = entityDef(entity);
    const body = toDataverse(entity, rec, true);
    body[def.pk] = rec.id; // client-generated GUID keeps cross-references stable
    const res = await this.client.createRecordAsync<Record<string, unknown>, Record<string, any>>(def.set, body);
    if (!res.success) this.fail('create', entity, res.error);
    const auto = def.cols.find((c) => c.autoNumber);
    if (auto) {
      const got = await this.client.retrieveRecordAsync<Record<string, any>>(def.set, rec.id, { select: [auto.col, 'createdon', 'modifiedon'] });
      if (got.success && got.data) return { id: rec.id, [auto.key]: got.data[auto.col], createdAt: got.data.createdon, updatedAt: got.data.modifiedon };
    }
    return { id: rec.id };
  }

  async update(entity: EntityName, id: string, changes: Record<string, any>) {
    const body = toDataverse(entity, changes, false);
    if (!Object.keys(body).length) return;
    const res = await this.client.updateRecordAsync<Record<string, unknown>, unknown>(entityDef(entity).set, id, body);
    if (!res.success) this.fail('update', entity, res.error);
  }

  async remove(entity: EntityName, id: string) {
    const res = await this.client.deleteRecordAsync(entityDef(entity).set, id);
    if (!res.success) this.fail('delete', entity, res.error);
  }

  private fileColumn(entity: EntityName, column: string) {
    const col = entityDef(entity).cols.find((c) => c.key === column && c.type === 'file');
    if (!col) throw new Error(`${column} is not a file column on ${entityDef(entity).display}`);
    return col.col;
  }

  async uploadFile(entity: EntityName, id: string, column: string, fileName: string, data: ArrayBuffer) {
    const res = await this.client.uploadFileToRecord(entityDef(entity).set, id, this.fileColumn(entity, column), fileName, data);
    if (!res.success) this.fail('upload', entity, res.error);
  }

  async downloadFile(entity: EntityName, id: string, column: string) {
    const res = await this.client.downloadFileFromRecord(entityDef(entity).set, id, this.fileColumn(entity, column));
    if (!res.success) this.fail('download', entity, res.error);
    return res.data;
  }

  async signedInEmail() {
    const ctx = await getContext();
    return ctx.user.userPrincipalName;
  }

  async searchDirectory(q: string, top: number) {
    const res = await this.client.retrieveMultipleRecordsAsync<Record<string, any>>(DIRECTORY.set, { select: DIRECTORY.select, filter: DIRECTORY.filter(q), orderBy: DIRECTORY.orderBy, top });
    if (!res.success) throw new Error(`Directory search failed: ${res.error instanceof Error ? res.error.message : String(res.error)}`);
    return DIRECTORY.toPeople(res.data || []);
  }
}
