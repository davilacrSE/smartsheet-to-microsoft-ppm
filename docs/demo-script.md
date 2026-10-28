# Demo script

A guided walkthrough of the accelerator, from a new idea to an archived project. Each step says how the work happened in Smartsheet and how it happens now, so the audience can map it to their own sheets.

## Before you start

- **Open the demo.** Use the [live demo](https://davilacrse.github.io/smartsheet-to-microsoft-ppm/), or run `npm run dev` and open http://localhost:3000. In the links below, `<demo>` stands for either address.
- **Switch people from the top right.** The persona menu lists every sample person with their role. Each role sees a different app: BRMs see New Intake, executives are read-only, and external people see only what they were granted.
- **Use deep links to save time.** `<demo>?as=elena.vasquez#/approvals` opens the app as Elena on her approvals inbox.
- **Rebrand for the audience.** Add `company`, `primary` and `ink` to the URL, for example `<demo>?company=Contoso&primary=%236B2FBA&ink=%231E0B36`.
- **Reset between sessions.** As Elena or Tom, go to Administration → Data & automation → Reset sample data.

| Person | Role | Use them to show |
|---|---|---|
| Priya Natarajan (`priya.natarajan`) | Business Relationship Manager | Intake |
| Elena Vasquez (`elena.vasquez`) | PMO Director | Gate decisions, NDA projects, administration |
| Aisha Rahman (`aisha.rahman`) | Project Manager | Plan, RAIDD, status and forecast |
| Jordan Blake (`jordan.blake`) | Senior Project Manager | A project in execution |
| Marcus Webb (`marcus.webb`) | Resource Team Manager | Capacity and nominations |
| Laura Chen (`laura.chen`) | Finance | Budget, forecast and actuals |
| Victoria Hale (`victoria.hale`) | Chief Information Officer, read-only | The executive view |
| Tom Becker (`tom.becker`) | System Administrator | Users, roles and settings |
| Dana Whitfield (`dana.whitfield`) | External consultant | Time-bound external access |

## The 15-minute version

1. **The problem, in one slide.** Every project used to be a Smartsheet workspace of 16 copied sheets. Open `<demo>?as=jordan.blake#/projects/ITProj-26-001/overview` and scroll to **Project artifacts**. The same 16 artifacts are now rows in Dataverse tables under one project record.
2. **Governance that enforces itself.** Open the **Governance** tab. Each gate shows its readiness checks against the project's own data. Go/No-Go is pending with open checks.
3. **One inbox for decisions.** Open `<demo>?as=elena.vasquez#/approvals`. Choose **Decide** on the Workday Recruiting Integration intake and approve Stage Gate 0. The project moves to Initiate and its artifacts are created.
4. **Capacity in the same tool.** Open `<demo>?as=marcus.webb#/resources`. The heatmap shows demand against capacity by team and month. Select a cell to see the projects behind it.
5. **The portfolio view.** Open `<demo>?as=victoria.hale`. The CIO sees stage, health, budget against forecast and actuals, and upcoming go-lives. Point out that the confidential acquisition project is not there.
6. **Close.** The same app runs in Microsoft Teams, and the data sits in the customer's own Dataverse environment.

## The full walkthrough: 14 steps in four phases

The example project is created live in step 1 and gets the next Project ID, ITProj-26-013. Later steps use sample projects that are already at those stages.

### Phase 1: Intake and approval

**Step 1. A BRM opens a new intake.** Open `<demo>?as=priya.natarajan#/intake/new`.
- *In Smartsheet:* requests went into the PPM Intake sheet, and its fields were later copied into each project's metadata sheet.
- *Now:* only BRMs see New Intake. One form captures the objective, benefits, cost, roadmap alignment, business, function, priority, Agile and ITGC flags, dates and uploads.
- *Show:* fill in a project, for example a Supplier Self-Service Portal, and choose **Save draft**. The intake stays in Draft until the BRM submits it.

**Step 2. Validation and a unique Project ID.**
- *In Smartsheet:* the ITProj-YY-NNN ID and the project type were assigned on the intake sheet.
- *Now:* required fields are checked before submit. Initiate must come before execution and go-live, and the form says why it blocks a save. The project gets the Draft stage and the next ID in the same format.
- *Show:* set the execution date before the initiate date to see the validation, then fix it.

**Step 3. Ready for Review notifies the PMO.**
- *In Smartsheet:* progress was tracked in a Workflow Status column.
- *Now:* **Save & mark Ready for Review** locks editing for the BRM, who can recall it until a decision. The PMO Director and PMO Program Administrator are notified, and a Stage Gate 0 review opens.
- *Show:* the bell icon for Elena, and the new review in her approvals inbox.

**Step 4. The Stage Gate 0 decision.** Open `<demo>?as=elena.vasquez#/approvals`.
- *In Smartsheet:* decisions were rows on the Approvals sheet: area, decision, notes and date.
- *Now:* My Approvals lists every pending gate with its readiness. The outcomes are Approve, Approve with Exception, Rework, Hold and Stop. The requester and the project's own BRM or PM cannot approve. Each decision records the approver, outcome, time, comments and conditions.
- *Show:* **Decide** on the new intake and approve it.

### Phase 2: Initiate

**Step 5. Artifacts are created in Dataverse.**
- *In Smartsheet:* approval to Initiate copied the templates into a new workspace of 16 sheets and a dashboard folder.
- *Now:* approval moves the project to Initiate and records the approval date. The same 16 artifacts are created as Dataverse rows under the project, numbered as before.
- *Show:* the project's **Overview** tab, **Project artifacts** card. Each artifact shows its table, update cadence, row count, last update and access.

**Step 6. Assign the team and stakeholders.**
- *In Smartsheet:* the Stakeholder Register and RACI sheets repeated the Project ID and name on every row.
- *Now:* the PMO assigns the PM, sponsor, BA, IT delivery lead and technical lead with a people picker. The stakeholder register and RACI are pre-filled from the template.
- *Show:* as Elena, **Edit** on the project record to set the PM and sponsor, then the **Stakeholders & RACI** tab.

**Step 7. Draft the plan, estimates and RAIDD.** Open `<demo>?as=jordan.blake#/projects/ITProj-26-001/plan`.
- *In Smartsheet:* three separate sheets for the Project Plan, Resource Estimator and RAIDD Log.
- *Now:* a WBS plan generated from the standard template, with baseline and forecast dates and overdue flags. Resource demand by labor area, specialty, team, dates and hours. RAIDD covers risks, actions, issues, decisions, dependencies, assumptions and change requests, with automatic IDs.
- *Show:* the **Plan**, **Resources** and **RAIDD** tabs.

**Step 8. Stage Gate 1 with readiness checks.**
- *In Smartsheet:* readiness was a set of checklist columns on the Project Record.
- *Now:* each gate has a configurable checklist evaluated against live project data. Approve is blocked while mandatory items are open. Approve with Exception needs a written justification, and the exception is recorded.
- *Show:* in step 6, make Aisha Rahman the PM of your new project. As Aisha, open **Governance** → **Request review** for Stage Gate 1. As Elena, choose **Decide**: Approve is blocked while checks are open, and Approve with Exception asks for a justification. The requester can never approve their own review.

### Phase 3: Plan and fund

**Step 9. Staff the work.** Open `<demo>?as=marcus.webb#/resources`.
- *In Smartsheet:* capacity data lived in sheets and fed a separate Power BI report.
- *Now:* the same capacity calculation runs in the app. The Resource Team Manager nominates a named person or declares a gap, and the PM confirms or rejects. Gaps escalate to the PMO and pillar leads. Scenarios test shifted start dates and added capacity.
- *Show:* the **Capacity** heatmap, then **Demand & nominations** → **Nominate** on the Dealer Portal request.

**Step 10. Weekly status and health.** Open `<demo>?as=jordan.blake#/projects/ITProj-26-001/status`.
- *In Smartsheet:* the Weekly Status Tracker held scope, schedule, resource, budget and overall health, plus a path to green.
- *Now:* weekly status is required from Plan through Hypercare. Overall health is calculated: Red if any of scope, schedule, resource or budget is Red or Yellow. Calculated suggestions sit beside the PM's values, and overdue updates trigger reminders.
- *Show:* the health card on **Overview**, with reported and calculated values side by side.

**Step 11. Stage Gates 2 and 3: funding approval.** Open `<demo>?as=laura.chen#/projects/ITProj-26-001/financials`.
- *In Smartsheet:* the Budget and Forecast sheet held the WBS element, spend type, approved budget and monthly columns, and the estimate sat in the Cost Estimator.
- *Now:* Stage Gate 2 confirms readiness for funding (ACT): BRD approved, plan baselined, resources feasible. Stage Gate 3 records the funding approval number and date. WBS elements and POs are captured after funding approval. Each capital or expense line is forecast monthly against its approved budget, with ERP actuals read-only.
- *Show:* the forecast grid, then the pending Stage Gate 2 on ITProj-26-002 in Elena's inbox.

### Phase 4: Deliver and close

**Step 12. Execute: design, build and test.** Open `<demo>?as=jordan.blake#/projects/ITProj-26-001/testing`.
- *In Smartsheet:* the UAT Test Plan and UAT Defect Tracker sheets, with a test reference typed on each defect.
- *Now:* Design Review and the Change Review Board run when risk or architecture impact requires them. Every UAT test case traces to BRD requirements, and uncovered requirements are flagged. Open P1 or P2 defects block Go/No-Go.
- *Show:* the **Testing** tab.

**Step 13. Go/No-Go, CAB and go-live.** Open `<demo>?as=elena.vasquez#/projects/ITProj-26-001/governance`.
- *In Smartsheet:* the Cutover Plan and Hypercare Defect Tracker sheets.
- *Now:* Go/No-Go checks UAT, defects, the cutover plan and required reviews. CAB approves the production change. **Go-Live & start Hypercare** moves the project to Hypercare, where cutover tasks and hypercare defects are tracked to closure.
- *Show:* the pending Go/No-Go and its open checks.

**Step 14. Close and archive.** Open `<demo>?as=elena.vasquez#/projects/ITProj-26-006/governance`.
- *In Smartsheet:* closure showed in a Workflow Status column, and the sheets stayed in the workspace.
- *Now:* Close needs hypercare defects closed and a current status, or an approved exception. Lessons learned and the benefits handoff are captured. Archive is manual, and history and audit are kept.
- *Show:* the Close checks on the Warehouse Management System Upgrade.

## Across every step

**Confidential NDA projects.** Open `<demo>?as=elena.vasquez#/projects/ITProj-26-004/access`.
- Only the PMO Director can designate an NDA project. It stays hidden from standard users, dashboards, reports, search and notifications until it is converted.
- The approved access list can include internal and external people.
- *Show:* switch to Victoria Hale. The acquisition project is missing from her portfolio, reports and search.

**External collaborators.** Open `<demo>?as=dana.whitfield`.
- Access is View or Edit, per artifact or for the whole workspace. The sponsor or owner approves first, then an administrator.
- Expiry is mandatory, and access is revoked automatically when it lapses. Renewals, revocations and recertifications are audited.
- *Show:* Dana sees two projects, and only the artifacts she was granted.

**Portfolio view and reports.** Open `<demo>?as=victoria.hale#/reports`.
- The dashboard shows stage, health, budget against forecast and actuals, upcoming go-lives and executive RAIDD items.
- Ten reports by business, function, pillar and stage, plus gate readiness, overdue updates and exceptions. Every view drills through to the project, and Power BI can read the same tables.

**A complete audit trail.** Open `<demo>?as=elena.vasquez#/audit`.
- Every field change, approval, exception, forecast, nomination and access event is recorded with the user, time, previous and new value.
- Standard users cannot edit or delete audit entries, and Dataverse table auditing is on for all 30 tables.

**Microsoft Teams.** The same app runs as a Teams personal app, so people approve gates and update status where they already work. See [deploy.md](deploy.md#microsoft-teams).

## The numbers to end on

| | |
|---|---|
| Template sheets per project | 16 become 1 IT Project record with child rows |
| Dataverse | 30 tables, 49 relationships, 2 security roles |
| Acceptance criteria | 18 of 18 covered by automated checks |
| Automated workflow checks | 49, all passing |
| Render checks | 4,650: every page for every persona, with an NDA leak check |

Same stages, gates, artifacts and numbering the PMO already used, now with one data model, enforced rules and one audit trail.
