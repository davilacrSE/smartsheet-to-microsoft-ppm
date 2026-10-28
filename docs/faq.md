# FAQ

### Why a code app, and not a canvas or model-driven app?

The PMO's process has many cross-cutting rules: gate checklists, segregation of duties, NDA visibility in every view, capacity calculations and external scope. A code app gives full control of the experience and the logic, and it still runs on the managed platform: Entra ID sign-in, Dataverse security, sharing limits, Conditional Access and data loss prevention policies. Makers can still build model-driven or canvas apps on the same tables, for example an administration app.

### What licenses do users need?

People who run code apps need a Power Apps Premium license, pay-as-you-go, an App Pass, or auto-claim of an available premium license. Power BI reports need Power BI licenses as usual. Check the current [code apps licensing](https://learn.microsoft.com/power-apps/developer/code-apps/overview#license-end-users-with-power-apps-premium) and the Power Platform licensing guide for the customer's agreement.

### Does it work in Microsoft Teams?

Yes. The repository packages a Teams personal app that hosts the deployed code app, with the same sign-in and security as the browser. The environment's content security policy must allow the Teams origins to frame the app. See [deploy.md](deploy.md#microsoft-teams).

### Does it work on a phone?

The layout adapts to narrow screens, but this accelerator hasn't been tested on phones. Code apps aren't supported in Power Apps for Windows.

### Where does the data live?

In the customer's own Dataverse environment, in their tenant and region. The demo keeps its sample data in the visitor's browser only.

### How are confidential (NDA) projects protected?

The app hides an NDA project from every view, search, report, notification and recent list for anyone off its access list, and an automated test checks every page for every persona. For production, also restrict it at the data layer with owner teams and business-unit read depth, as described in [deploy.md](deploy.md#harden-for-production).

### Can external consultants use it?

Yes, as Entra B2B guests. Each grant covers one project, is View or Edit, needs two approvals and has a mandatory expiry. A daily sweep expires grants, and the app hides everything outside the grant.

### Can we keep our Smartsheet templates and numbering?

Yes. The artifact catalog keeps the 0.0 to 9.0 and X.0b numbering, and the WBS, RACI and cost estimator templates are plain lists you can edit. See [customize.md](customize.md#artifact-templates).

### Can the PMO change the process without a developer?

Gate checklists, gate approvers, master data lists and thresholds are all in **Administration**. New stages, new columns and new artifact types are code changes.

### What happens to our existing Smartsheet projects?

Cordova finished in-flight projects in Smartsheet and started new intakes in the app. Other options are re-keying a few large projects, a bulk import from Excel exports, or syncing during a transition with the Smartsheet connector in Power Automate. See [smartsheet-to-microsoft.md](smartsheet-to-microsoft.md#options-for-projects-already-in-flight).

### How do financial actuals get in?

The ERP stays the system of record. A scheduled flow or dataflow loads actuals into the financial actual table, and the app shows them read-only next to the approved budget and the PM's forecast.

### Can we report in Power BI?

Yes. Power BI connects to the same Dataverse tables, and **Administration → Settings** has a link that puts an "Open Power BI report" button on the portfolio dashboard. The app also has ten built-in reports with CSV export.

### What still has to be built for production?

The Power Automate flows for email and Teams delivery, the daily sweep schedule, NDA owner-team sync, external sharing and the ERP actuals load. Also the data-layer hardening steps. Both lists are in [deploy.md](deploy.md#power-automate-flows-to-build).

### Is this a Microsoft product?

No. It is a sample accelerator, provided as-is under the MIT license, built on Microsoft Power Platform.
