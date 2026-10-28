/**
 * Builds the Microsoft Teams app package for the PPM code app:  npm run teams:package
 *
 * The Teams app is a personal app whose tab hosts the deployed Power Apps code app, so Dataverse access and
 * sign-in stay inside the Power Apps player. The environment's code-app CSP frame-ancestors must include the
 * Teams origins (see docs/deploy.md). Output:
 *   teams/package/manifest.json, color.png (192x192), outline.png (32x32)
 *   teams/<AppName>-Teams-<version>.zip   ← upload in Teams or the Teams admin center
 *
 * Names, colors and links come from src/brand.ts. Icons are drawn from the brand mark unless you add your own
 * teams/icon-color.svg (192x192) and teams/icon-outline.svg (32x32, white on transparent).
 *
 * Inputs: power.config.json (written by `pac code init` / `pac code push`), or the environment variables
 * POWERAPPS_APP_ID and POWERAPPS_ENV_ID. Also TEAMS_TENANT_ID (required), TEAMS_APP_VERSION,
 * TEAMS_PRIVACY_URL and TEAMS_TERMS_URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { BRAND, DATAVERSE } from '../src/brand';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const powerFile = path.join(root, 'power.config.json');
const power = fs.existsSync(powerFile) ? JSON.parse(fs.readFileSync(powerFile, 'utf8')) : {};
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const appId: string = process.env.POWERAPPS_APP_ID || power.appId || '';
const envId: string = process.env.POWERAPPS_ENV_ID || power.environmentId || '';
const tenantId = process.env.TEAMS_TENANT_ID || '';
const version = process.env.TEAMS_APP_VERSION || pkg.version;
const missing = [!appId && 'POWERAPPS_APP_ID (or run `pac code push` first)', !envId && 'POWERAPPS_ENV_ID', !tenantId && 'TEAMS_TENANT_ID'].filter(Boolean);
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}. See docs/deploy.md → Microsoft Teams.`);
  process.exit(1);
}

/** Stable Teams app id derived from the Power Apps app id (name-based UUID v5), so re-packaging updates the same app. */
function stableGuid(name: string) {
  const h = crypto.createHash('sha1').update(`ppm-teams:${name}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const play = `https://apps.powerapps.com/play/e/${envId}/app/${appId}?tenantid=${tenantId}`;
const manifest = {
  $schema: 'https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json',
  manifestVersion: '1.17',
  version,
  id: stableGuid(appId),
  developer: {
    name: `${BRAND.company} IT PMO`,
    websiteUrl: play,
    privacyUrl: process.env.TEAMS_PRIVACY_URL || BRAND.website,
    termsOfUseUrl: process.env.TEAMS_TERMS_URL || BRAND.website,
  },
  name: { short: BRAND.appName, full: `${BRAND.company} IT Project & Portfolio Management` },
  description: {
    short: 'IT project intake, stage gates, artifacts, capacity and portfolio reporting.',
    full:
      `${BRAND.appName} is the system of record for IT projects: BRM intake, Stage Gate 0–3 and governance reviews (Design Review, CRB, Go/No-Go, CAB), ` +
      'project artifacts (stakeholders, RACI, BRD, plan, RAIDD, UAT, cutover, hypercare, weekly status, budget & forecast), resource capacity planning ' +
      'with nominations and scenarios, confidential NDA projects, time-bound external access, notifications and audit history. Data is stored in ' +
      `Microsoft Dataverse (${DATAVERSE.solution.uniqueName} solution); access follows your ${BRAND.appName} role.`,
  },
  icons: { outline: 'outline.png', color: 'color.png' },
  accentColor: BRAND.ink,
  staticTabs: [
    {
      entityId: 'ppm',
      name: BRAND.appName,
      // Documented code-app embed URL (no source=teamstab: that switches the player to canvas-app Teams sign-in,
      // which code apps don't support). ppmhost/theme are forwarded to the app as query parameters.
      contentUrl: `${play}&hideNavBar=true&ppmhost=teams&theme={theme}&locale={locale}`,
      websiteUrl: play,
      scopes: ['personal'],
    },
    { entityId: 'about', scopes: ['personal'] },
  ],
  permissions: ['identity'],
  validDomains: ['apps.powerapps.com', '*.powerapps.com', '*.powerplatformusercontent.com', '*.powerplatform.com'],
};

// ── icons: the brand mark (three schedule bars), or your own SVGs ──
const BARS = 'M6 7.5h7M9 12h9M12 16.5h5';
const defaultColor = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" fill="${BRAND.primary}"/>
  <g transform="translate(48 48) scale(4)"><path d="${BARS}" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"/></g>
</svg>`;
const defaultOutline = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g transform="translate(2 2) scale(1.1667)"><path d="${BARS}" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"/></g>
</svg>`;
const svgSource = (file: string, fallback: string) => (fs.existsSync(path.join(here, file)) ? fs.readFileSync(path.join(here, file), 'utf8') : fallback);
function render(svg: string, size: number) {
  const img = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render();
  return { png: img.asPng(), width: img.width, height: img.height, pixels: img.pixels };
}
const color = render(svgSource('icon-color.svg', defaultColor), 192);
const outline = render(svgSource('icon-outline.svg', defaultOutline), 32);

// ── validation (Teams app package rules) ──
const problems: string[] = [];
if (manifest.name.short.length > 30) problems.push('name.short > 30 characters');
if (manifest.name.full.length > 100) problems.push('name.full > 100 characters');
if (manifest.description.short.length > 80) problems.push('description.short > 80 characters');
if (manifest.description.full.length > 4000) problems.push('description.full > 4000 characters');
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) problems.push('version must be MAJOR.MINOR.PATCH');
if (!/^#[0-9a-f]{6}$/i.test(manifest.accentColor)) problems.push('accentColor must be a #RRGGBB color');
if (color.width !== 192 || color.height !== 192) problems.push('color icon must be 192x192');
if (outline.width !== 32 || outline.height !== 32) problems.push('outline icon must be 32x32');
for (let i = 0; i < outline.pixels.length; i += 4) {
  const [r, g, b, a] = outline.pixels.subarray(i, i + 4);
  if (a > 0 && (r < a - 1 || g < a - 1 || b < a - 1)) {
    problems.push('outline icon must be white on a transparent background');
    break;
  }
}
if (!outline.pixels.some((v, i) => i % 4 === 3 && v === 0)) problems.push('outline icon needs a transparent background');
for (const t of manifest.staticTabs) if (t.contentUrl && !manifest.validDomains.some((d) => new URL(t.contentUrl.replace(/\{\w+\}/g, 'x')).hostname.endsWith(d.replace('*.', '')))) problems.push(`contentUrl host not in validDomains: ${t.contentUrl}`);
if (problems.length) {
  console.error('Teams package validation failed:\n - ' + problems.join('\n - '));
  process.exit(1);
}

// ── write package + zip ──
const outDir = path.join(here, 'package');
fs.mkdirSync(outDir, { recursive: true });
const files: [string, Buffer][] = [
  ['manifest.json', Buffer.from(JSON.stringify(manifest, null, 2))],
  ['color.png', Buffer.from(color.png)],
  ['outline.png', Buffer.from(outline.png)],
];
for (const [name, data] of files) fs.writeFileSync(path.join(outDir, name), data);

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
/** Minimal ZIP (deflate) writer — files at the archive root, as Teams requires. */
function zip(entries: [string, Buffer][]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const deflated = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, deflated);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + deflated.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const zipPath = path.join(here, `${BRAND.appName.replace(/[^A-Za-z0-9]+/g, '')}-Teams-${version}.zip`);
fs.writeFileSync(zipPath, zip(files));
console.log(`Teams app "${manifest.name.short}" v${version} (id ${manifest.id})`);
console.log(`  tab → ${manifest.staticTabs[0].contentUrl}`);
console.log(`  package → ${path.relative(root, zipPath)}`);
