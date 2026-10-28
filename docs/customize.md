# Tailor it for a customer

Most of what a customer wants changed is either one file, [src/brand.ts](../src/brand.ts), or a screen in **Administration**. Code changes are only needed for new columns, new stages or new artifact types.

## Branding

Edit `BRAND` in [src/brand.ts](../src/brand.ts):

| Field | Default | Used for |
|---|---|---|
| `company` | Cordova | Sidebar wordmark, stakeholder company, internal and external wording |
| `appName` | Cordova PPM | Window title, Teams app name, security role names |
| `tagline` | IT Project & Portfolio Mgmt | The line under the company name |
| `emailDomain` | cordova.example | Sample people's emails, and the demo's internal domain |
| `primary` | `#0F766E` | Buttons, links, focus rings and active states |
| `ink` | `#0B2E32` | Sidebar, avatars, toasts and the loading screen |
| `logoUrl` | none | A logo image in `public/`, for example `./logo.svg`. It replaces the wordmark |
| `website` | https://www.example.com | Developer links in the Teams app |

The theme derives every other interface color from `primary` and `ink`, in light and dark mode. Chart and status colors do not change with the brand: they are a validated palette that stays readable for people with color vision deficiency. Pick a `primary` dark enough for white button text, at a 4.5:1 contrast ratio or better.

The browser icon is [public/favicon.svg](../public/favicon.svg). The Teams icons are drawn from the brand mark in the `primary` color, unless you add your own `teams/icon-color.svg` (192 by 192) and `teams/icon-outline.svg` (32 by 32, white on transparent).

## Rebrand the demo from its URL

The demo build reads display overrides from the URL, so you can show a prospect their own name and colors without rebuilding or redeploying. The deployed Dataverse app ignores these parameters.

| Parameter | Example | Effect |
|---|---|---|
| `company` | `company=Contoso` | Company name. It also sets the app name to "Contoso PPM" and the sample emails to `@contoso.example` |
| `app` | `app=Contoso%20Portfolio` | App name, when the default is not right |
| `tagline` | `tagline=Enterprise%20PMO` | The line under the company name |
| `primary`, `ink` | `primary=%236B2FBA&ink=%231E0B36` | Colors. Write `#` as `%23` |
| `as` | `as=priya.natarajan` | Opens the app as that sample person |

Each company name gets its own sample dataset in the browser, so switching names starts from fresh data.

## A screenshot pack in the customer's brand

```bash
npm run screenshots -- --company Contoso --primary "#6B2FBA" --ink "#1E0B36" --out ./contoso-shots
```

The script starts the demo, opens it in a local Chrome or Edge, and captures the same 17 screens as [docs/images](images). Use `--only portfolio-dashboard,governance` for a subset, and `--scale 2` for high-resolution images. Set `CHROME_PATH` if your browser is not found.

## Dataverse naming

The `DATAVERSE` block in [src/brand.ts](../src/brand.ts) sets the publisher, the table prefix and the solution:

```ts
export const DATAVERSE = {
  prefix: 'cordova',
  publisher: { uniqueName: 'cordovappm', displayName: 'Cordova PPM', optionValuePrefix: 10079 },
  solution: { uniqueName: 'ITProject', displayName: 'IT Project (Cordova PPM)', version: '1.0.0.0' },
};
```

- **Choose these before the first provisioning.** A publisher prefix has 2 to 8 letters or numbers, starts with a letter and cannot start with `mscrm`. If a publisher with the prefix already exists, the script reuses it.
- **Changing the prefix later creates a second set of tables.** The old tables stay until you delete them.
- **After a prefix change, register the tables again** with `npm run pac:add-sources`. It regenerates `.power/schemas/appschemas/dataSourcesInfo.ts`, which still names the default tables until you do.

## Terminology, stages and gates

| What | Where |
|---|---|
| Stage names and descriptions | `STAGES` and `STAGE_DESCRIPTIONS` in [src/domain/constants.ts](../src/domain/constants.ts), and the `Stage` type in [src/domain/types.ts](../src/domain/types.ts) |
| Gates and governance reviews | `GATES` in [src/domain/constants.ts](../src/domain/constants.ts): name, purpose, authority and allowed stages |
| Stage transitions without a gate | `TRANSITIONS`: Start Execution, Go-Live and Move to Close |
| Funding approval | Cordova calls its funding approval "ACT". Search for `ACT` in `src/` to rename it to the customer's term, such as capital request or funding decision |

Stage names are used in the sample data and the tests too. Run `npm run check` after renaming them.

## Configure it in the app

Administrators and the PMO Director can change these in **Administration** without a deployment:

| Tab | What you can change |
|---|---|
| **Users & roles** | PPM profiles, application roles and notification preferences |
| **Workflow & gates** | The required checklist for every gate and transition, and who may approve each gate |
| **Master data** | Business areas, business functions, corporate priorities, benefit types, IT roadmap options, IT pillars, programs, applications, labor categories, specialties, spend categories and hour buckets |
| **Settings** | Internal email domains, stages that require weekly status, the Power BI report link, budget tolerance, schedule and resource-gap thresholds, and external access limits |
| **Access review** | Active external access grants to recertify or revoke, and the NDA access lists |
| **Data & automation** | Run the daily sweep, reset or remove sample data |

The defaults for all of these live in `DEFAULT_CONFIG`, `DEFAULT_GATE_CHECKS` and `DEFAULT_GATE_APPROVERS` in [src/domain/constants.ts](../src/domain/constants.ts). The checklist items a gate can use are listed in `CHECKS`.

## Artifact templates

When Stage Gate 0 approves an intake, the app creates the project's artifacts from three templates in [src/domain/constants.ts](../src/domain/constants.ts):

| Template | Creates |
|---|---|
| `PLAN_TEMPLATE` | The WBS: phases, tasks, milestones and gates |
| `RACI_DELIVERABLES` | The standard RACI rows and their default assignments |
| `COST_TEMPLATE` | The cost estimator tree, under both capital and operating expense |

Edit them to match the customer's templates. Changes apply to projects approved after the change.

## Add a column

1. Add the column to the table in [src/data/model.ts](../src/data/model.ts). For artifact tables, add the field to [src/domain/schemas.ts](../src/domain/schemas.ts) instead, which also puts it on the artifact's form and table. For other tables, also add it to the screen that edits them.
2. Run `npm run dataverse:provision`. It creates only what is missing.
3. Run `npm run build` and `pac code push --solutionName ITProject`.

## Change the Project ID format

The ID is a Dataverse autonumber, `ITProj-{DATETIMEUTC:yy}-{SEQNUM:3}`, set on the `code` column in [src/data/model.ts](../src/data/model.ts). The demo backend in [src/data/mock.ts](../src/data/mock.ts) mimics it. Change both before the first provisioning.

## Change the sample data

[src/data/seed.ts](../src/data/seed.ts) defines the sample people, teams, resources and the 12 projects with all their artifacts. Every sample project has the sample-data flag, so **Remove sample projects** can clean it up in a real environment.
