# Vercel Pro preparation

Owner decision: keep Vercel and prepare Pro for the paid launch. No plan change,
new paid seat, payment method or bill has been authorized by this preparation.
The owner subsequently chose to leave the upgrade pending. Authenticated plan
readback on October 28, 2026 confirmed **Hobby**. Keep paid production sales closed.

The linked team is **hikmagitzs-projects**
(`team_UoTX9BIswVAop56hlgcbsUqm`), and the project is **solace-hikmagitz**
(`prj_pgHSZQaH2JiJpZeuxbAtxfKeDXM2`). Keep this project and its existing domain;
there is no need to create another team or migrate the database.

## Owner checkout

1. Open the team's [Billing settings](https://vercel.com/teams/hikmagitzs-projects/settings/billing).
2. Review the Pro checkout, billing identity, tax and payment details. Current
   published pricing is US$20/month for the platform, including one deploying
   seat and US$20 usage credit. Additional usage and deploying seats can cost
   more. This is separate from the app's €1/month Pro subscription.
3. Select the actual usage controls and alerts in the team settings. An alert
   alone is not a spending cap; confirm what happens at the selected limit.
4. Review the applicable DPA and Team Settings → Data Preferences for the real
   account. Do not infer those settings from a local environment flag.
5. Complete the upgrade in Vercel. The assistant should then read back the team
   plan before enabling any paid launch configuration.

Hobby permits personal, non-commercial use. Preparing/testing the source does
not make Hobby suitable for a paid launch. No store or production payment
enable flag is set by these instructions.

## Prepared deployment configuration

[deploy/vercel.pro.json](../deploy/vercel.pro.json) prepares hourly native
subscription reconciliation. It is deliberately a separate configuration:
Hobby only supports daily cron schedules, so the hourly job is not activated by
ordinary deployments while the team remains on Hobby.

After the Pro plan is verified:

- Set a new random server-only `CRON_SECRET` of at least 32 characters in this
  project's Production environment. Never use a public/mobile environment
  variable, store credential or user password for it.
- Finish Apple/Google server credentials, notifications, product setup and the
  sandbox checks in [publication-owner-actions.md](publication-owner-actions.md).
- Deploy the prepared configuration from the repository root:

```powershell
npx.cmd --yes vercel@59.25.4 deploy --prod --yes --project prj_pgHSZQaH2JiJpZeuxbAtxfKeDXM2 --scope hikmagitzs-projects --local-config deploy/vercel.pro.json --logs
```

- Verify the deployment's cron entry and run history. The endpoint requires the
  secret as a bearer token. Do not paste it into a URL or chat.
- Confirm provider notifications and reconciliation results in sandbox before
  binding the database and application to production. A scheduled job does not
  establish purchase, renewal or refund correctness by itself.

Official references checked October 28, 2026:
[Pro pricing](https://vercel.com/docs/plans/pro-plan),
[Hobby restrictions](https://vercel.com/docs/plans/hobby),
[cron pricing and limits](https://vercel.com/docs/cron-jobs/usage-and-pricing),
[Spend Management](https://vercel.com/docs/spend-management),
[Vercel DPA](https://vercel.com/legal/dpa).
