/**
 * Captures the README screenshots from the demo (sample data) with a local Chrome or Edge.
 *
 *   npm run screenshots
 *   npm run screenshots -- --company Northwind --primary "#2563EB" --ink "#0B1B3B" --out ./northwind-shots
 *
 * Use the brand options to produce a screenshot pack in a prospect's name and colors for a proposal or deck.
 * The browser is found automatically; set CHROME_PATH to use a specific one.
 *
 * Options: --out <dir> (default docs/images)  --scale <device pixel ratio> (default 1)  --only <name,...>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const outDir = path.resolve(root, arg('out', 'docs/images'));
const scale = Number(arg('scale', '1'));
const only = arg('only', '').split(',').filter(Boolean);
const brand = new URLSearchParams();
for (const k of ['company', 'primary', 'ink', 'tagline']) if (arg(k)) brand.set(k, arg(k));

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const candidates = BROWSERS.filter((p) => fs.existsSync(p));

/** Some managed devices block automation in one browser but not another, so try each installed one. */
async function launchBrowser() {
  for (const executablePath of candidates) {
    try {
      return await puppeteer.launch({ executablePath, headless: true, args: ['--hide-scrollbars', '--disable-gpu'] });
    } catch (e) {
      console.warn(`  could not start ${executablePath}: ${String(e.message).split(/\r?\n/)[0]}`);
    }
  }
  console.error('No Chrome or Edge could be started. Set CHROME_PATH to a Chromium-based browser.');
  process.exit(1);
}

/** name, route, persona (email local part), options. */
const SHOTS = [
  ['portfolio-dashboard', '/', 'elena.vasquez'],
  ['projects', '/projects', 'elena.vasquez'],
  ['project-overview', '/projects/ITProj-26-001/overview', 'jordan.blake'],
  ['project-artifacts', '/projects/ITProj-26-001/overview', 'jordan.blake', { card: 'Project artifacts' }],
  ['governance', '/projects/ITProj-26-001/governance', 'elena.vasquez'],
  ['approvals', '/approvals', 'elena.vasquez'],
  ['project-plan', '/projects/ITProj-26-001/plan', 'jordan.blake'],
  ['raidd-log', '/projects/ITProj-26-001/raidd', 'jordan.blake'],
  ['weekly-status', '/projects/ITProj-26-001/status', 'jordan.blake'],
  ['financials', '/projects/ITProj-26-001/financials', 'laura.chen'],
  ['resource-capacity', '/resources?tab=capacity', 'marcus.webb'],
  ['new-intake', '/intake/new', 'priya.natarajan', {
    fill: [
      ['Project name', 'Supplier Self-Service Portal'],
      ['Main objective', 'Give suppliers a self-service portal for onboarding, PO acknowledgement and invoice status, integrated with SAP and Ariba.'],
      ['Desired outcome', 'Cut supplier onboarding from 15 to 5 days and reduce AP status calls by 40%.'],
      ['Estimated cost', '480000'],
      ['Estimated benefit', '900000'],
      ['Benefit type', 'Productivity'],
      ['IT roadmap alignment', 'On FY27 IT Roadmap'],
    ],
  }],
  ['reports', '/reports', 'victoria.hale'],
  ['nda-access', '/projects/ITProj-26-004/access', 'elena.vasquez'],
  ['persona-switcher', '/', 'elena.vasquez', { click: 'button.persona' }],
  ['dark-mode', '/', 'victoria.hale', { dark: true }],
  ['rebranded-demo', '/', 'elena.vasquez', { brand: { company: 'Northwind', primary: '#2563EB', ink: '#0B1B3B' } }],
];

const server = await createServer({ root, logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await launchBrowser();
fs.mkdirSync(outDir, { recursive: true });
let n = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: scale });
  for (const [name, route, persona, opts = {}] of SHOTS) {
    if (only.length && !only.includes(name)) continue;
    const q = new URLSearchParams(opts.brand ?? Object.fromEntries(brand));
    q.set('as', persona);
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opts.dark ? 'dark' : 'light' }]);
    await page.evaluateOnNewDocument(() => localStorage.setItem('ppm-theme', 'system'));
    await page.goto(`${base}?${q}#${route}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.shell main.content', { timeout: 30000 });
    // The demo banner explains preview mode in the live app; keep it out of documentation images.
    await page.addStyleTag({ content: '.mode-banner { display: none !important; } .toasts { display: none !important; }' });
    if (opts.click) await page.click(opts.click);
    for (const [label, value] of opts.fill ?? []) {
      // The control inside the form field whose label starts with this text.
      const handle = await page.evaluateHandle((text) => {
        const field = [...document.querySelectorAll('.field')].find((f) => f.querySelector(':scope > label')?.textContent?.trim().startsWith(text));
        return field?.querySelector('input, textarea, select') ?? null;
      }, label);
      const el = handle.asElement();
      if (!el) throw new Error(`No form field labelled "${label}" on ${route}`);
      if ((await el.evaluate((n) => n.tagName)) === 'SELECT') await el.select(value);
      else await el.type(value);
    }
    await page.evaluate(() => document.activeElement?.blur?.());
    await new Promise((r) => setTimeout(r, 400));
    const file = path.join(outDir, `${name}.png`);
    if (opts.card) {
      const card = await page.evaluateHandle((title) => [...document.querySelectorAll('section.card')].find((c) => c.querySelector('.card-head h3')?.textContent?.trim() === title), opts.card);
      const el = card.asElement();
      if (!el) throw new Error(`Card "${opts.card}" not found on ${route}`);
      await el.screenshot({ path: file });
    } else {
      await page.screenshot({ path: file });
    }
    n++;
    console.log(`  ✓ ${path.relative(root, file)}`);
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`${n} screenshot(s) in ${path.relative(root, outDir) || '.'}`);
