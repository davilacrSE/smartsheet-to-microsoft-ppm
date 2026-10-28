/**
 * Customer branding and naming: the one file to edit when you tailor this accelerator for a customer.
 *
 * Display values (company, app name, colors, logo) only change what people see. The `DATAVERSE` block names the
 * publisher, table prefix and solution that `npm run dataverse:provision` creates, so set it before you provision
 * an environment for the first time (see docs/customize.md).
 *
 * The demo build (sample data in the browser, no Dataverse) also reads display overrides from the URL, so you can
 * show a prospect "their" app without rebuilding:
 *
 *   ?company=Fabrikam&primary=%23C50F1F&ink=%232B0A0A
 */
export interface Brand {
  /** Company name shown in the sidebar, stakeholder records and internal/external wording. */
  company: string;
  /** Product name used for the window title, the Teams app and the Dataverse security roles. */
  appName: string;
  /** Line under the company name in the sidebar. */
  tagline: string;
  /** Email domain of the sample personas, and the default internal domain of the demo. */
  emailDomain: string;
  /** Primary color: buttons, links, focus rings, active states. */
  primary: string;
  /** Ink color: sidebar, avatars, toasts and the loading screen. */
  ink: string;
  /** Optional logo image in public/ (for example '/logo.svg'). When set it replaces the wordmark. */
  logoUrl?: string;
  /** Public website of the customer, used for the Teams app's developer links. */
  website: string;
}

const DEFAULT_BRAND: Brand = {
  company: 'Cordova',
  appName: 'Cordova PPM',
  tagline: 'IT Project & Portfolio Mgmt',
  emailDomain: 'cordova.example',
  primary: '#0F766E',
  ink: '#0B2E32',
  website: 'https://www.example.com',
};

/** Dataverse naming. Changing the prefix after provisioning creates a second set of tables. */
export const DATAVERSE = {
  prefix: 'cordova',
  publisher: { uniqueName: 'cordovappm', displayName: 'Cordova PPM', optionValuePrefix: 10079 },
  solution: { uniqueName: 'ITProject', displayName: 'IT Project (Cordova PPM)', version: '1.0.0.0' },
};
export const TABLE_PREFIX = `${DATAVERSE.prefix}_`;

const HEX = /^#?([0-9a-f]{6})$/i;
const hex = (v: string | null) => (v && HEX.test(v.trim()) ? `#${HEX.exec(v.trim())![1]}` : undefined);
const clean = (v: string | null, max = 40) => v?.replace(/[<>]/g, '').trim().slice(0, max) || undefined;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'demo';

/** Demo builds only: display overrides from the page URL. The deployed (Dataverse) app ignores them. */
function urlOverrides(): Partial<Brand> {
  try {
    if ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_DATA_MODE === 'dataverse') return {};
    const search = globalThis.location?.search;
    if (!search) return {};
    const q = new URLSearchParams(search);
    const out: Partial<Brand> = {};
    const company = clean(q.get('company'));
    if (company) {
      out.company = company;
      out.appName = clean(q.get('app')) || `${company} PPM`;
      out.emailDomain = `${slug(company)}.example`;
    }
    const tagline = clean(q.get('tagline'), 60);
    if (tagline) out.tagline = tagline;
    const primary = hex(q.get('primary'));
    if (primary) out.primary = primary;
    const ink = hex(q.get('ink'));
    if (ink) out.ink = ink;
    return out;
  } catch {
    return {};
  }
}

export const BRAND: Brand = { ...DEFAULT_BRAND, ...urlOverrides() };

/** Applies the brand to the page: window title and the two CSS custom properties the theme derives from. */
export function applyBrand(doc: Document = document) {
  doc.title = BRAND.appName;
  doc.documentElement.style.setProperty('--brand', BRAND.primary);
  doc.documentElement.style.setProperty('--brand-ink', BRAND.ink);
}
