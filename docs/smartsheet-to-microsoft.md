# Smartsheet to Microsoft

This guide maps how an IT PMO typically runs on Smartsheet to how the same process runs on Microsoft Power Platform in this accelerator. It covers the capability mapping, the six steps Cordova took, and the options for projects that are already in flight.

## How Smartsheet concepts map

| In Smartsheet | In this accelerator | Microsoft service |
|---|---|---|
| A workspace per project, copied from template sheets | One IT Project record. Its artifacts are child rows, created when Stage Gate 0 approves the intake | Dataverse |
| A sheet | A table, such as `cordova_plantask` for the Project Plan | Dataverse |
| Row hierarchy (indent and outdent) | A parent lookup on plan tasks, BRD requirements and cost items, with WBS numbering in the app | Dataverse |
| Dropdown columns | Value lists that PMO administrators edit in Administration → Master data | Dataverse |
| Contact list columns | Person lookups to PPM user profiles, with a people picker that searches the organization directory | Dataverse, Microsoft Entra ID |
| Symbols columns such as RYG balls | Health values. Overall health is calculated from scope, schedule, resource and budget | Code app |
| Cell links and cross-sheet formulas | One lookup from every artifact row to its project. Calculations such as health, budget variance and capacity run in the app | Dataverse, code app |
| Forms | A BRM-only intake form with validation, drafts and file uploads | Code app, Dataverse file column |
| Automations: alerts, reminders and update requests | In-app notifications and a daily sweep for overdue status, forecasts and expiring access. A flow delivers them by email and Teams | Power Automate |
| Approval requests | Gate reviews with readiness checks, segregation of duties, five outcomes and recorded exceptions | Code app, Dataverse |
| Reports | Ten portfolio reports with CSV export | Code app |
| Dashboards | A role-aware portfolio dashboard, plus an optional link to a Power BI report | Code app, Power BI |
| Sheet sharing: viewer, editor, admin | Dataverse security roles plus thirteen application roles | Dataverse, Microsoft Entra ID |
| Dynamic View and sharing with people outside the company | External access grants per artifact or workspace, approved by the sponsor and then an administrator, with a mandatory expiry date | Code app, Entra B2B, Power Automate |
| Control Center blueprints and global updates | An artifact catalog and templates applied at Stage Gate 0. Schema changes ship once, in the solution, to every project | Dataverse solutions |
| Resource Management | Teams, named resources and capacity, project demand, nominations, gaps and what-if scenarios | Code app, Dataverse |
| Activity log and cell history | A business audit trail with user, time, before and after values, plus Dataverse table auditing | Dataverse |
| Attachments | Intake uploads in a Dataverse file column. SharePoint document management is optional | Dataverse, SharePoint |
| Smartsheet for Microsoft Teams | The same app as a Teams personal app, with the same sign-in and security | Microsoft Teams |
| Data Shuttle and imports | Dataflows, the Smartsheet connector or the Dataverse Web API | Power Query, Power Automate |

Three things are worth saying out loud in a customer conversation:

- **The PMO keeps its process.** Stages, gates, artifact names and the 0.0 to 9.0 numbering stay the same. People recognize their templates on day one.
- **Rules become enforceable.** A sheet can only suggest that a gate needs a BRD. Here, Approve is blocked until the checklist passes or an approver records an exception.
- **Security moves to the platform.** Access follows Microsoft Entra ID, Dataverse security roles and the customer's Conditional Access and data loss prevention policies, instead of per-sheet sharing.

## The move in six steps

This is how Cordova moved from Smartsheet to Microsoft.

| Step | What happened |
|---|---|
| 1. Start from the requirements | The PMO's business requirements defined nine stages, eight gates and reviews, the roles, and 18 acceptance criteria |
| 2. Use the sheets as the spec | One real project's Smartsheet exports gave every artifact's columns |
| 3. Model it in Dataverse | Each sheet became a table with a lookup to the IT Project. The model is one file, [src/data/model.ts](../src/data/model.ts) |
| 4. Provision the solution | A script created the solution: 30 tables, 49 relationships and two security roles |
| 5. Build the app | A React and TypeScript code app covers the whole lifecycle |
| 6. Test and deploy | Automated workflow and render tests, then publish to Power Apps and package for Teams |

What moved was the templates, the rules and the process. Cordova did not migrate Smartsheet project data. New intakes started in the new app, and projects already in flight finished where they were.

## Options for projects already in flight

Pick per project, based on how far along it is and how much history matters.

| Option | How it works | Good for |
|---|---|---|
| **Finish in Smartsheet** | New intakes start in the app. Active projects finish in Smartsheet, which then becomes read-only | Short transitions, and projects close to go-live. This is what Cordova chose |
| **Re-key at the current stage** | The PMO creates the project in the app and approves it through Stage Gate 0, which creates its artifacts. The PM then brings over the live plan, RAIDD items and status | A handful of large projects with years still to run |
| **Bulk import from exports** | Export each sheet to Excel, map its columns to the artifact table and load it with a Power Query dataflow. Set the project lookup and map contacts to PPM users | Many projects with the same templates |
| **Sync during coexistence** | Use the Smartsheet connector in Power Automate. It has triggers such as *When a new row is created* and *When a sheet is updated*, and actions such as *Get a sheet* | A period where both tools run side by side |

Practical tips for an import:

- Run `npm run dataverse:plan` to print every table and column the app expects. Use it as the target of the column mapping.
- Load the IT Project rows first, then the artifact rows, because every artifact row needs its project lookup.
- Map Smartsheet contact columns to PPM user profiles by email. People who have no profile can be created in Administration → Users & roles.
- Keep the Smartsheet row ID in a note or a spare column during the transition, so you can reconcile counts afterwards.
- Import into a test environment first and check the counts in each project's artifact table.

## What stays outside the app

- **Financial actuals** stay in the ERP, which remains the system of record. A scheduled load copies actuals into the financial actual table, where the app shows them read-only.
- **Enhancements and non-IT work** were out of scope for Cordova's PMO, and the app is built for IT projects.
- **Documents** can stay in SharePoint. Dataverse can link a SharePoint document library to each project record.

## Related

- [Demo script](demo-script.md): each walkthrough step shows how it worked in Smartsheet and how it works now.
- [Architecture](architecture.md): data model and security model.
- [Smartsheet connector reference](https://learn.microsoft.com/connectors/smartsheet/) on Microsoft Learn.
