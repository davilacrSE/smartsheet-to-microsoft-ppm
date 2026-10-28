# Deploy to an environment

This guide takes the accelerator from a clone to a running app in a customer's Power Platform environment, then into Microsoft Teams. Plan on a development environment first, and move to test and production as a managed solution.

## Prerequisites

| Need | Details |
|---|---|
| A Power Platform environment with Dataverse | A development environment is best for the first install |
| Code apps turned on | Power Platform admin center → **Manage** → **Environments** → *your environment* → **Settings** → **Product** → **Features** → **Power Apps code apps** → turn on **Enable code apps** → **Save** |
| Licenses for users | People who run code apps need a Power Apps Premium license, pay-as-you-go, an App Pass, or auto-claim. See [code apps licensing](https://learn.microsoft.com/power-apps/developer/code-apps/overview#license-end-users-with-power-apps-premium) |
| Your permissions | System Administrator in the environment, to create the solution, tables and roles |
| Tools | Node.js LTS, Git, the [Power Platform CLI](https://learn.microsoft.com/power-platform/developer/cli/introduction) (`pac`) and the Azure CLI (`az`) |

## 1. Get the code and check it

```bash
git clone https://github.com/davilacrSE/smartsheet-to-microsoft-ppm.git
cd smartsheet-to-microsoft-ppm
npm install
npm run check        # type-check, 49 workflow checks, render test of every page and persona
```

## 2. Name it for the customer

Edit [src/brand.ts](../src/brand.ts) before you provision. Set the company and app names, colors and email domain, and the `DATAVERSE` block: publisher, table prefix and solution name. The defaults create the publisher `caldovappm` with the prefix `caldova` and the solution `ITProject`. See [customize.md](customize.md).

## 3. Sign in

The scripts get a Dataverse token from the Azure CLI. The `pac` commands use their own auth profile.

```bash
az login --tenant <tenant-id> --allow-no-subscriptions
pac auth create --environment https://<org>.crm.dynamics.com
```

If you already have a token, set `DATAVERSE_TOKEN` and skip `az`. If your Azure CLI account spans several tenants, set `AZ_TENANT` or `AZ_SUBSCRIPTION` so the token comes from the right one.

## 4. Provision Dataverse

```bash
# bash
DATAVERSE_URL=https://<org>.crm.dynamics.com npm run dataverse:provision

# PowerShell
$env:DATAVERSE_URL = 'https://<org>.crm.dynamics.com'; npm run dataverse:provision
```

Add `-- --seed` to load the sample data: 12 projects at every stage, 20 people, teams, resources and about 2,300 artifact rows, all flagged as sample data.

The script creates, in order:

1. The publisher and the solution.
2. 30 tables and their columns, then 49 relationships, with auditing on every table.
3. The Project ID autonumber, then it publishes the customizations.
4. Two security roles with their privileges: *App name* User and *App name* Administrator.
5. A default settings row, with your email domain as the internal domain.
6. A PPM administrator profile for you. Set `PPM_ADMIN_EMAIL` to use another account.

It is idempotent. Run it again after you add a column, and it creates only what is missing. Run `npm run dataverse:plan` first to see everything it will create, without connecting.

## 5. Create the code app and register the tables

```bash
pac code init -n "Caldova PPM" -b ./dist -f index.html
npm run pac:add-sources
```

`pac code init` writes `power.config.json` for this environment. `npm run pac:add-sources` runs `pac code add-data-source` for all 30 tables plus `systemuser`, which the people picker uses to search the directory. It also regenerates the data source file the app imports. Add `-- --print` to see the commands without running them.

## 6. Build and publish

```bash
npm run build
pac code push --solutionName ITProject
```

The push prints the app's URL. Some environments keep code apps outside Dataverse solutions. In that case the push publishes the app without adding it to the solution, so add it yourself: make.powerapps.com → **Solutions** → **ITProject** → **Add existing** → **App**.

To run your local code against the live environment, use `npm run dev:dataverse` and open the **Local Play** URL it prints, in the browser profile you use for that tenant.

> Microsoft is introducing an npm-based Power Apps CLI (`pa`) that will replace the `pac code` commands. The `pac code` commands above are the ones this accelerator was deployed with. See the [Power Apps CLI quickstart](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/create-an-app-from-scratch) for the new commands.

## 7. Give people access

1. Share the app with the people or groups who will use it.
2. Assign them the **Basic User** and *App name* **User** security roles. Administrators also get *App name* **Administrator**.
3. Create their PPM profiles and application roles in **Administration → Users & roles**. Someone who signs in without a profile sees "Access not provisioned".

## 8. Check the deployment

With sample data loaded, run:

```bash
npm run dataverse:verify
```

It reads all 30 tables through the same mapping the app uses, runs the portfolio logic on the result, and does a write round trip on the notification table.

## Microsoft Teams

The Teams app is a personal app whose tab loads the deployed code app, so sign-in and Dataverse security work exactly as in the browser.

1. **Let Teams frame the app.** In the Power Platform admin center, open **Environments** → *your environment* → **Settings** → **Product** → **Privacy + Security** → **Content security policy** → **App** tab. Add these origins to `frame-ancestors`. They merge with the default value. See [Configure content security policy](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/content-security-policy).
   ```
   https://teams.microsoft.com https://*.teams.microsoft.com https://teams.cloud.microsoft https://*.teams.cloud.microsoft
   ```
2. **Build the package.** It reads the app and environment IDs from `power.config.json` after the push.
   ```bash
   TEAMS_TENANT_ID=<tenant-id> npm run teams:package
   TEAMS_TENANT_ID=<tenant-id> TEAMS_APP_VERSION=1.0.1 npm run teams:package   # when you update an installed app
   ```
   Set `TEAMS_PRIVACY_URL` and `TEAMS_TERMS_URL` to the customer's policy pages. The Teams app ID is derived from the Power Apps app ID, so repackaging updates the same Teams app.
3. **Install it.** Custom app upload must be allowed by the Teams app setup policy.
   - For yourself: Teams → **Apps** → **Manage your apps** → **Upload an app** → **Upload a custom app**.
   - For the organization: Teams admin center → **Teams apps** → **Manage apps** → **Upload new app**. Optionally pin it with an app setup policy.

Do not add `source=teamstab` to the tab URL. It switches the Power Apps player to canvas app sign-in for Teams, which fails for code apps.

## Power Automate flows to build

The app records everything these flows need. Until they exist, notifications appear in the app, and **Administration → Data & automation → Run now** runs the daily sweep on demand.

| Flow | Trigger | What it does |
|---|---|---|
| Send notification | A notification row is added | Sends an email (Office 365 Outlook) or a Teams message, per the row's channels |
| Daily sweep | Schedule | Overdue status and forecast reminders, go-live, Go/No-Go and CAB alerts, gap alerts, grant expiry |
| NDA owner team sync | The project's NDA flag or its access list changes | Maintains an owner team per NDA project, as described below |
| External access share and revoke | An access grant's status changes | Shares the project or artifact rows when a grant becomes active, and revokes them when it expires or is revoked |
| ERP actuals load | Schedule, or a dataflow | Loads financial actuals into the financial actual table |

## Harden for production

The app hides NDA projects and enforces its rules in every view. Before go-live, enforce them at the data layer too:

1. **NDA row security.** Give the User role **Business Unit** read depth, instead of Organization, on the IT Project table and the artifact tables. Have the NDA owner team flow create an owner team per NDA project in a restricted business unit, assign the project to it, and sync the access list to team membership. Artifact rows follow through the parental relationship. On conversion, reassign the project to the standard IT Projects team.
2. **Notifications.** Have a flow assign each notification row to its recipient, and give users **User**-level read on notifications.
3. **External users.** Invite them as Entra B2B guests, and let the share and revoke flow manage their access.
4. **Server-side rules.** Gate checks, segregation of duties and finance-field rules run in the app. For tamper-proof enforcement, add Dataverse plug-ins or low-code plug-ins on gate review and IT Project updates.
5. **Auditing.** Turn on organization-level auditing in the environment. Table-level auditing is already on for all 30 tables.

## Remove the sample data

**Administration → Data & automation → Remove sample projects** deletes every project flagged as sample data, and their artifacts cascade-delete with them. Audit events are kept. Remove the sample people, teams and resources separately.

## Move to test and production

Export the solution from development as a **managed** solution and import it into test, then production. Run the provisioning script only in development, so every other environment gets its schema from the solution.
