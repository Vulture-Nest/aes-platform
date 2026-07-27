# AES — Gap Analysis: Specification vs Implementation

**Date:** 2026-07-27
**Sources audited:** `AES_System_Design_Flow_Document (1).pdf` (32pp, incl. Appendix A business rules + Appendix B traceability), `AES_Handover_Guide`, `AES_Build_Flow`, `AES_Additional_Features_Specification.docx`, and the 5 sample workbooks.
**Code audited:** `apps/api`, `apps/admin`, `apps/web`, `apps/mobile` (via 6 domain audits, cross-checked against the code).

> **Fix log:**
> - ✅ **Tier 1 (G1–G6) closed** (PR #56) — payroll reproduces the reference paysheets (golden-tested), back-pay/acting feed the run, `decide` is authorised, delegation works, `audit_log` is append-only at the DB, G4 scoped "NOW" hardening (arbitrary-currency payroll deferred per §7).
> - ✅ **Tier 2 (G7–G10) closed** on `fix/gap-analysis-tier2` — pluggable Email/Teams/Push delivery (config-optional; push needs a device-token store), 4 dormant danger rules activated, nightly loan/ZIMRA accrual + order-health recalc/red-state alerts, director-withdrawal nudge scheduled.
> - ✅ **G11 web half done** (PR #58) — CRM, Marketing, Boards, Projects, Site-Reports, Returns-Hub now on the web app. Mobile half (light Projects/Boards + Timesheets G12) pending.
> - Full suite: **76 suites / 752 tests green**. Remaining Tier-3–5 open.

## What is solid (calibration)
Appendix A finance math (A.1–A.9) implemented as faithful, unit-tested services; all 8 Command Centre panels; RBAC + per-site scoping + Postgres RLS + segregation-of-duties; multi-currency core (effective-dated append-only rates, `(amount,currency,fx_rate_id,rate_type)` storage, first-class conversions); the generic approval engine + 5 workflow modules; CRM backend; payroll bank-account encryption at rest; migration-parity import (verdict **ACT**); and the 7 additional features' **backend + admin UI**.

---

## 🔴 Tier 1 — Shipped-but-incorrect / unsafe (highest priority)

| # | Gap (spec ref) | Evidence | Effort |
|---|---|---|---|
| G1 | **Payroll doesn't reproduce the reference paysheets** (fails acceptance §18.3). PAYE+AIDS taxed on one dominant currency, not split USD/ZWG legs; UG/night/COLA allowances always **0** (no rate config/wiring); Nyaradzo + employee-side NEC/MIPF + garnish/maintenance hardcoded **0** → net overstated; per-employee-per-run ratio unsupported; ZIMDEF/MIPF levied on gross vs sheet's basic. | `payroll.service.ts:771‑830`, `gross-buildup.service.ts` | L |
| G2 | **Back-pay & Acting never feed payroll** — both emit `PayrollExtraEarning`, but `computeRun` never reads it (grep in `payroll/` = ∅). Back-pay also recomputes basic only (no OT/allowance knock-on). | `payroll-adjustments/*`, `payroll.service.ts` | M |
| G3 | **Approval `decide` lacks authorization** — any authenticated non-requester can approve/reject **any** step; only self-approval is blocked (no `@Roles`, no `approverRole` check). | `approvals.controller.ts` `decide`, `approval.service.ts:144` | S |
| G4 | **Multinational is a tag, not a driver** (add-feat §7 acceptance FAILS). `PayrollRun.entityId` never set; tax types/currencies/filing calendar hardcoded to ZW; `StatutoryRate` has no country column. (WHT rates *are* country-keyed.) | `payroll.service.ts:205‑212`, `returns.service.ts:9‑17`, `schema.prisma:182` | L |
| G5 | **Delegation is inert** — matrix rows target roles, so `resolveDelegate` never substitutes; an absent director's items still only reach that director. | `approval.service.ts:251‑261,204` | M |
| G6 | **Audit log not append-only at DB level** — no trigger/REVOKE; a privileged DB/ORM path could edit/delete audit rows. Code comment claiming triggers is false. | migrations grep = ∅; `audit.service.ts:22` | S |

## 🟠 Tier 2 — Command Centre / danger alerts have live holes

| # | Gap (spec ref) | Evidence | Effort |
|---|---|---|---|
| G7 | **Danger alerts never reach directors off-app** — push (FCM), email (Graph), Teams all **stubbed** (`logger.log`). Only in-app works. Undercuts the owner's #1 objective. | `notification.service.ts:28,57‑61` | L |
| G8 | **4 of 10 danger rules dormant** — `payroll_coverage` (DANGER) seeded **disabled**; `petty_cash_variance`, `concentration_risk`, `conversion_loss` have no evaluator. | `danger-engine.service.ts`, `danger-rules.service.ts` | M |
| G9 | **Missing scheduled accrual/recalc jobs** (§3.3) — no loan-interest accrual (`loan_interest` never written), no ZIMRA-interest accrual, no nightly order-health recalc + **red-state transition alerts**. | `scheduled-jobs.service.ts` (6 crons, none of these) | M |
| G10 | **Director-withdrawal stale-posted nudge not scheduled** (§11.5) — method exists, no cron. | `director-withdrawals.service.ts:353` | S |

## 🟡 Tier 3 — Missing major capabilities (build)

| # | Gap (spec ref) | Evidence | Effort |
|---|---|---|---|
| G11 | **Web + mobile rollout of the 7 new features + CRM = 0%** — CRM, marketing, boards, projects/WBS, returns-hub, back-pay/acting, entities, site-reports have backend+admin but **no end-user web/mobile UI**. Spec wants **mobile-light Project WBS** (§4.2) and **confidential boards on phones** (§3). | `web/src/App.tsx`, mobile router | L |
| G12 | **Mobile Timesheets screen missing** — §15.1 flagship offline-first use case; backend+web exist, mobile sync plumbing exists, no timesheet UI. | `mobile/.../features` | M |
| G13 | **Microsoft Fabric / Power BI / conversational AI = 0%** (§3, §15.2‑15.3). **Externally blocked** (needs Fabric tenant + paid capacity). | grep `fabric\|power bi` = ∅; `handover` | XL / external |
| G14 | **Accounts Ledger single-entry; revenue never posts** — only outflows + payroll post; order receipts & contract claims don't hit the ledger. | `ledger.service.ts:59` | M |
| G15 | **Missing / non-scheduled exports** — bank schedule & statutory-returns pack JSON-only; no client manhours report per site/month (§12.6); Orders/Receivables/VAT/Tax/Performance not downloadable; no scheduled/Teams/email report subscriptions. | `reports.controller.ts` (5 endpoints) | M |

## 🟢 Tier 4 — Data-model fields & §16 "oversight" items

| # | Gap (spec ref) | Effort |
|---|---|---|
| G16 | Order health/profit/margin not exposed on the order API (only in command-centre panels). | S |
| G17 | Missing §6 fields: Client `vatNumber`/`paymentTerms`/`currencyRatioDefault`; Order `title`/`issueDate`/`advancePayment`; OrderExpense `category`+`attachmentId`; ContractClaim `vatPaidToDate`/`receivedDate`; Overhead `paye_due`/`paye_paid`. | M |
| G18 | Partial order servicing (App B.2a) — milestones + `PARTIALLY_SERVICED` not implemented (order still binary). | M |
| G19 | Corporate income tax provision line in health view (§16.4) — missing. | S |
| G20 | Fiscal-invoice attachment not mandatory on VAT-claimed expenses (§16.5); attachments not wired into expenses/travel/site-reports/payroll-adj/**loans** (§16.14). | S |
| G21 | Structured SHE capture missing (§16.10, add-feat §8.3) — only a free-text JSON site-report section. | M |
| G22 | Timesheet reopen doesn't unlock (records request, never reverts LOCKED→OPEN); compliance obligations not auto-generated on payroll approval. | S |
| G23 | A.10 parity is $1 tolerance on 6 headlines, not "$0.01 per line" (§A.10); workbook `Settings` sheet not imported. | S |
| G24 | Notification config unreachable — no admin channel-config page (§4.1), no per-user prefs UI. | S |
| G25 | Misc: petty-cash cumulative conversions report (§9.4); no `@@unique(site,currency)` on floats; travel overspend not captured; approval matrix unseeded; hard-coded USD/ZWG in panels/danger; in-app help pages (App B.2b). | S each |

## ⚙️ Tier 5 — Non-functional / infra
- **G26** — MFA not enforced for FD/Directors/Admin (§18.1). **M**
- **G27** — Backups / PITR / quarterly restore drill (§16.12, §18.1) — ops/infra. **ops**
- **G28** — Mobile push = `NoopPushService` (no firebase dep) + no mobile Notifications screen. **M**
- Deliberate deviations (not defects): `@nestjs/schedule` DB-polling instead of BullMQ; local JWT (not Entra); separate web/admin/mobile apps.

---

*This document doubles as the Appendix-B UAT checklist; update statuses as gaps are closed.*
