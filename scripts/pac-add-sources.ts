/**
 * Registers every Dataverse table in src/data/model.ts, plus systemuser for the people picker, as a data source
 * of the code app. It runs `pac code add-data-source` once per table, which also regenerates
 * .power/schemas/appschemas/dataSourcesInfo.ts and the typed services under src/generated/.
 *
 * Run it from the repo root after `npm run dataverse:provision` and `pac code init`, with `pac auth` pointing at
 * the target environment:
 *
 *   npm run pac:add-sources              # run pac for every table
 *   npm run pac:add-sources -- --print   # only print the commands
 */
import { spawnSync } from 'node:child_process';
import { ENTITIES } from '../src/data/model';

const tables = [...ENTITIES.map((e) => e.table), 'systemuser'];
const PRINT = process.argv.includes('--print');
let failed = 0;
for (const table of tables) {
  const args = ['code', 'add-data-source', '-a', 'dataverse', '-t', table];
  console.log(`pac ${args.join(' ')}`);
  if (PRINT) continue;
  const r = spawnSync('pac', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    failed++;
    console.error(`  ✗ ${table} (exit code ${r.status ?? 'none'})`);
  }
}
if (!PRINT) console.log(failed ? `\n${failed} of ${tables.length} data sources failed` : `\n${tables.length} data sources added`);
process.exit(failed ? 1 : 0);
