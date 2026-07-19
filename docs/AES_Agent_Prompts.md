# AES System — AI Coding Agent Prompts

Sequenced prompts for Claude Code (or similar). Run in order — each assumes the previous stage is merged. Paste **Prompt 0 (Project Context)** into the project's `CLAUDE.md` / system context first so every later prompt inherits it. Keep the design PDF in the repo at `docs/AES_System_Design.pdf` and reference it.

**Repository:** https://github.com/Vulture-Nest/aes-platform (private, org `Vulture-Nest`). All stages are branches/PRs into `main` on this repo; CI must pass before merge.

---

## Prompt 0 — Project Context (put in CLAUDE.md)

```
You are building the AES Operations & Finance Management System for Airflow Environmental
Solutions, a Zimbabwean mining-services contractor. Full spec: docs/AES_System_Design.pdf.
Repository: https://github.com/Vulture-Nest/aes-platform (private). Work on feature
branches (stage/<n>-<name>), open PRs into main; never push directly to main.

Stack: NestJS (TypeScript, REST + WebSocket, OpenAPI), Flutter (mobile + web, one codebase),
PostgreSQL 16 + Prisma, Redis + BullMQ, Microsoft Entra ID via OIDC, FCM push, Microsoft
Graph for email/Teams/SharePoint file storage, server-side XLSX/PDF/CSV generation.
Monorepo: apps/api (NestJS), apps/app (Flutter), packages/shared (generated API contracts).

Non-negotiable principles:
1. Single source of truth: PostgreSQL. Excel is an OUTPUT format only.
2. Approve first, fund second: fund availability NEVER blocks approval; it sets
   Approved-Ready-to-Pay vs Approved-Pending-Funds and drives escalation.
3. Human executes money movement: system prepares/approves/posts; a person performs the
   bank/wallet transfer and captures the reference.
4. Multi-currency native (USD + ZWG): every monetary value is stored as
   (amount, currency, fx_rate_id, rate_type[official|parallel|client_ratio]).
   Never convert destructively. Exchange rates are append-only and effective-dated.
5. Site-first capture with offline tolerance for mine sites (Mimosa, Unki, Zimplats, HQ).
6. Auditability everywhere: append-only audit_log (actor, table, record_id, action,
   before/after JSONB, timestamp) on every insert/update/approval/status change.
7. All statutory values (VAT %, PAYE bands per currency, NSSA/ZIMDEF/NEC/MIPF params,
   ZIMRA interest %) are effective-dated admin configuration, never hardcoded.
8. RBAC per user per site, enforced in NestJS guards AND Postgres row-level security.
   Roles: Site Clerk, Site Manager, Operations Staff, Finance Officer, Finance Director (FD),
   Operations Director (OD), Managing Director/Directors, System Administrator,
   Auditor (read-only). No user may ever approve their own request.
9. Business logic lives in unit-tested domain services, not report-layer arithmetic.
   Appendix A of the spec is the authoritative rulebook; classic workbook rules must be
   reproduced to $0.01 before any IMPROVE variant activates.
10. Timezone Africa/Harare; all interest accrued by nightly jobs, idempotently.

Conventions: UUID PKs; created_by/created_at/updated_by/updated_at on all tables;
class-validator DTOs; feature modules mirror the spec's module map; every endpoint guarded;
write migration + unit tests + OpenAPI annotations with every feature. Ask before inventing
any business rule not in the spec.
```

---

## Prompt 1 — Scaffold

```
Clone https://github.com/Vulture-Nest/aes-platform and create the monorepo scaffold per
CLAUDE.md on branch stage/1-scaffold:
- apps/api: NestJS 10+, Prisma to PostgreSQL 16, config module with validated .env schema,
  health endpoint, OpenAPI at /docs, global validation pipe, exception filter, request
  logging with correlation IDs.
- docker-compose.dev.yml: postgres:16, redis:7, minio (local stand-in for SharePoint/S3
  file storage behind a StorageService interface).
- apps/app: Flutter 3.x with flavors (dev/prod), Riverpod, go_router, dio client generated
  from OpenAPI, web target enabled.
- packages/shared: OpenAPI-generated types script.
- CI (GitHub Actions): lint, unit tests, prisma migrate diff check, Flutter analyze + test.
Deliver: running `docker compose up` + `npm run start:dev` yields healthy API; README with
setup steps. No business logic yet.
```

## Prompt 2 — Auth, RBAC, Audit, Reference Data

```
Implement foundations:

1. Auth: OIDC login against Microsoft Entra ID (authorization code + PKCE for Flutter,
   JWT validation in Nest). On first login auto-provision `users`
   (entra_object_id, email, status, employee_id nullable). MFA enforcement flag for
   FD/OD/Director/SysAdmin roles. Session/refresh handling for mobile.

2. RBAC: tables `roles`, `user_site_roles` (user_id, site_id, role). Role guard +
   @Roles()/@Sites() decorators reading the user's site-scoped roles. Mirror with Postgres
   RLS policies so a Mimosa-only Site Clerk cannot read Unki rows even via raw SQL.
   Auditor role = read-everything, write-nothing.

3. Audit: `audit_log` append-only. Postgres trigger capturing before/after JSONB on all
   business tables + Nest interceptor recording actor and correlation ID. No UPDATE/DELETE
   grants on audit_log. Admin search endpoint (filter by actor, table, record, date).

4. Reference data + admin APIs:
   - sites (name, type mine_site|head_office, client_id nullable, active) seeded with
     Mimosa, Unki, Zimplats, Head Office.
   - exchange_rates: append-only, effective-dated (date_effective, currency_pair,
     official_rate, parallel_rate, source, entered_by). Service method
     rateAsOf(date, type) — never overwrite; new row supersedes.
   - statutory_rates: effective-dated rows for vat_pct (seed 15.5%), zimra_interest_pct
     (seed 10% p.a.), nssa params, zimdef_pct, nec/mipf params, paye_bands as JSONB per
     currency.
   - thresholds: petty_cash_fd_threshold per currency (seed USD 100), danger-rule
     parameters, SLA timer durations.
   - delegation_rules: approver_user_id, delegate_user_id, date_from, date_to, active.

5. Notification service: NotificationService.send(userIds, template, payload, severity)
   fanning out to FCM push, Graph email, Teams message per user channel preferences;
   severity rules: in-app always; push+email for Watch+; Danger adds Teams to all directors
   with repeat-until-acknowledged support (BullMQ repeatable job cancelled on ack).

Tests: RLS isolation between sites; rateAsOf returns historically correct rates; audit rows
written for every mutation; delegation window logic.
```

## Prompt 3 — Generic Approval Engine

```
Build the single shared approval engine used by ALL modules (requisitions, travel, budgets,
petty cash above threshold, director withdrawals, payroll runs, timesheet periods, budget
change requests, petty cash top-ups).

Tables:
- approval_matrix: module, min_amount, max_amount, currency, site_id nullable,
  step_order, approver_role, mode (sequential | parallel | either).
- approvals: subject_table, subject_id, step, approver_user_id, decision
  (approved | rejected | returned), decided_at, comment.

Behaviour:
1. submit(subjectTable, subjectId, amount, currency, siteId): read matrix for
   (module, amount band, currency, site), instantiate chain (sequential steps and/or
   parallel co-approvals; 'either' = any one approver in the step suffices).
2. Notify each active approver (push+email+Teams) and expose an Approvals Inbox endpoint
   with full subject context + attachments.
3. decide(approvalId, decision, comment?): Approve advances the chain; Return sends the
   subject back to requester editable and clears the chain; Reject closes it. Subject
   status updates via a StatusTransition callback each module registers.
4. Hard rules: self-approval blocked at engine level (compare requester vs approver);
   active delegation substitutes the alternate; the person recording payment completion
   cannot be the requester.
5. SLA timers (BullMQ): reminder after configurable T1 (default 24h); escalate to next
   role/directors after T2. Timers cancel on decision.
6. Every decision writes approvals + audit_log.

Tests: matrix reconfiguration changes routing with no code change; self-approval rejected;
parallel co-approval requires all (or 'either' semantics); delegation substitution;
SLA reminder + escalation with mocked clock; Return → resubmit restarts chain.
```

## Prompt 4 — Financial Core Domain

```
Implement the financial core with Appendix A of docs/AES_System_Design.pdf as unit-tested
domain services.

Tables (per spec §6.1–6.3): clients, contracts, contract_claims, orders, order_receipts,
order_expenses, general_expenses, overheads, loans, loan_repayments, loan_interest,
tax_ledger, other_tax_debt, zimra_assessments, accounts, ledger_entries. Money fields
follow the (amount, currency, fx_rate_id, rate_type) rule.

Domain services (each pure, injectable, fully unit-tested):

A1 OrderFinancials: vat = value_ex_vat × current VATRate; total_incl_vat; spent_to_date =
   Σ order_expenses ex VAT; received official = USD + ZiG÷official_rate; received street =
   USD + ZiG÷street_rate; outstanding = total_incl_vat − received(official);
   profit_ex_vat = value − spent; net_profit = profit − Σ linked loan interest;
   margin = profit ÷ value (blank if value 0). Classic mode uses current settings rate;
   IMPROVE mode uses rate effective on receipt date. Both behind a strategy flag,
   classic default until migration parity sign-off.

A2 OrderHealth state machine, strict first-match order:
   1 received ≥ total_incl_vat (±$0.01) → PAID
   2 anything received AND not serviced → ADVANCE_PAID
   3 serviced AND today > closing_date → OVERDUE_PAYMENT
   4 serviced AND not past closing → AWAITING_PAYMENT
   5 not serviced AND today > closing_date → OVERDUE_SERVICE
   6 otherwise → OPEN
   Plus optional service milestones (description, pct-or-value, date_completed):
   serviced_% = completed value ÷ order value; PARTIALLY_SERVICED state between OPEN and
   AWAITING_PAYMENT when some but not all milestones complete. Binary tick remains default.
   Re-evaluate health on every receipt/service event and nightly; emit alert on transition
   into either red state.

A3 ContractVariance: contract_months = whole months start→end inclusive (+1);
   monthly_budget = value_ex_vat ÷ months; months_elapsed capped, 0 before start;
   should_have_invoiced = monthly_budget × months_elapsed;
   variance = invoiced_to_date − should_have_invoiced (positive = over-claimed = red).
   Status: Upcoming | Active | Completed by date.

A4 LoanInterest: attach loan agreement documents + repayment schedules to loan records
   (file storage). Simple weekly interest = principal × weekly_rate × ((today−start)/7,
   fractional, not rounded). total_due = principal + accrued. repaid = USD + ZiG÷official.
   balance = total_due − repaid; Settled when ≤ $0.01. Flat-on-principal is default;
   reducing-balance supported per-loan (interest_method column). Nightly accrual job
   writes loan_interest rows idempotently (unique per loan per day).

A5 TaxLedgerConsolidation: output VAT = VAT on serviced orders + contract claims;
   input VAT = flagged order + general expenses + overheads; net = output − input +
   brought-forward VAT principal − VAT paid on orders/claims (can be negative =
   recoverable). PAYE: due + brought-forward − paid. other_tax_debt keeps PAYE and VAT as
   SEPARATE rows; interest = principal × ZIMRA rate × days_overdue ÷ 365 per row.

A6 ZimraReconciliation: discrepancy = books − assessed (VAT and PAYE separately);
   days_overdue = max(0, today − due_date); interest = max(0, books) × rate × days ÷ 365;
   total_liability = max(0,netVAT) + max(0,netPAYE) + other_debt balance + other_debt
   interest — recoverables floored at zero.

A7 Performance: income = serviced order values ex VAT + claims ex VAT (unserviced
   excluded); expenses = order + general + overheads + loan interest; operating profit,
   margin; debt-funding view; pending obligations formula per spec.

A8 HealthVerdict (classic): ACT if receivables + tax liability + loan balance > total cash
   received; WATCH if receivables > 50% of cash received; else HEALTHY. Keep alongside
   the time-windowed Command Centre verdict later.

Accounts Ledger: double-entry ledger_entries with source references; accounts seeded
(bank USD, bank ZWG, petty cash per site, mobile wallet). Posting service used by all
modules; every approved financial event posts here. Cash position = ledger-derived.

Also: CRUD endpoints per role matrix, mandatory-attachment option on VAT-claimed expenses,
nightly jobs (interest accrual, health re-eval, contract status), and report endpoints
generating XLSX/PDF/CSV for Orders Dashboard, Receivables, VAT obligations, Tax ledger +
summary, Performance, Financial Summary.

Write the Appendix A test suite as table-driven tests with golden values so migration
parity (Prompt 5) can reuse it.
```

## Prompt 5 — Data Migration & Parity Gate

```
Build a one-time migration CLI (apps/api script) importing from the current Excel
workbooks placed in ./migration-input/:
- Operational Cashflow Report: clients, contracts + claims, orders + receipts + expenses,
  general expenses, overheads, loans + repayments, other tax debt, ZIMRA assessments,
  settings (VAT 15.5%, rates).
- Three payroll workbooks (Mimosa, Unki, Head Office): employees master (works_no, names,
  national_id, nssa_no, grade, nec_class, occupation, site, employment_type, pay_mode
  client-ratio|fixed-split, fixed_usd_pct, hourly_rate, bank, branch, account_no,
  account_currency, leave_balance).

Requirements: idempotent (re-run replaces staging, never duplicates); dry-run mode;
row-level validation report (missing FKs, bad dates, currency anomalies); everything
tagged migration batch id.

Parity gate (spec A.10): after import, run the classic-mode Appendix A services on the
same report date and produce a reconciliation report (XLSX) comparing per line: every
order's health, payment status, profit, loan interest, tax ledger lines, ZIMRA dashboard,
Performance, Financial Summary verdict. Flag any delta > $0.01. Exit non-zero if any flag.
The IMPROVE feature flags stay off until this report is clean and Finance signs off.
```

## Prompt 6 — Workflow Modules

```
Implement the five workflow modules on the approval engine (Prompt 3) and ledger
(Prompt 4). Shared lifecycle: Draft → Submitted → Approved|Rejected|Returned →
FundsCheck → Approved-Ready-to-Pay | Approved-Pending-Funds → Disbursed →
(travel only) Retired → Closed.

1. Cash requisitions: form (purpose, amount, currency, required_by_date, optional order
   link, attachment). Route per matrix. APPROVAL IS MERIT-ONLY — never block on funds.
   On approval snapshot live cash position from ledger: sufficient → Ready-to-Pay,
   notify Finance; short → Pending-Funds, notify requester + Finance with shortfall.
   Daily job re-tests Pending-Funds vs ledger and deadlines: escalate to FD at
   N days out (default 3); missed deadline raises Danger alert. Disbursement: Finance
   selects source account (bank/mobile/petty cash), captures reference, ledger posts,
   item closes.

2. Travel allowances: adds destination, dates, auto per-diem from admin rate table
   (grade × destination class) × days, advance handling. After disbursement →
   Awaiting Retirement. Retirement: receipts + unspent cash, Finance reconciles
   refund-due/owed, closes. Unretired > N days: reminders + FD dashboard list.

3. Petty cash: petty_cash_floats (site, currency, custodian, float_amount, derived
   balance); petty_cash_txns (withdrawal | top-up | conversion-out | conversion-in).
   Below FD threshold: custodian voucher (purpose, amount, order link, receipt photo)
   + Site Manager confirm → posts immediately. At/above threshold: FD approval BEFORE
   cash leaves. Conversions: two linked legs, achieved rate, variance vs official-of-day;
   above threshold also FD-approved; cumulative conversion gain/loss report per site.
   Reconciliation: periodic in-app count; variance beyond tolerance → FD alert + lock
   further withdrawals until resolved. Imprest top-up = vouchers since last top-up
   (itself an approvable item; disbursement moves bank → site petty cash in ledger).

4. Budgets: header + line items (category, description, amount, currency); clone from
   prior period. Submission → PARALLEL co-approval by OD and FD; both required; either
   Return restarts after correction. Active budgets track actuals (order expenses,
   general expenses, overheads, requisitions) per line in real time; warn at 85%,
   alert at 100% (configurable). Revisions are new approvable versions with full history.
   Budget Change Requests use the same dual path.

5. Director withdrawals: director raises (amount, currency, destination account, reason);
   co-approval by second director (configurable co-signatory or any other; self-approval
   impossible). On approval: informational funds check, then post to ledger as
   "Posted — Awaiting Transfer" so cash position reflects it IMMEDIATELY. Finance or
   director then selects transfer method (EFT|RTGS|mobile|cash), executes manually,
   captures reference, marks Completed (completer ≠ requester). Nudge job flags stale
   Posted items. Full trail visible to all directors + auditor.

Acceptance tests (from spec §18.3): requisition approved with insufficient funds shows
Pending-Funds, notifies both with shortfall, escalates 3 days before deadline; USD 100+
petty cash cannot post without FD approval; budget Active only after both OD and FD;
director withdrawal in ledger before transfer, completion requires method + reference.
```

## Prompt 7 — Command Centre & Danger Engine

```
Build the Business Health Command Centre API and danger alerting (spec §14) — the module
the whole system exists to feed. Works on financial core data alone (payroll enriches
later).

Panels (one endpoint each or one composite, <2s response):
1. Cash position: live per-account balances from ledger (bank USD, bank ZWG, petty cash
   per site, wallets), totals USD-equivalent at official AND street rates, 30/60/90-day
   trend.
2. Money in vs out: rolling inflows (order receipts, contract claims) vs outflows
   (expenses, overheads, payroll when available, tax, loan service); day/week/month.
3. Debt & interest watch: per loan principal, accrued interest, weekly burn; ZIMRA debt
   with accruing interest; debt service due next 30/60/90 days.
4. Orders vs payroll & expenses: expected-in (open + serviced-unpaid orders) vs
   expected-out (committed salaries, overheads, approved requisitions) with headline
   coverage ratio.
5. Receivables ageing: 0-30/31-60/61-90/90+ per client, overdue highlighted.
6. Tax exposure: net VAT, net PAYE, assessments, days overdue, interest accruing; plus a
   corporate income tax PROVISION ESTIMATE line (25% + 3% AIDS levy on operating profit,
   labelled as an estimate) so the verdict is not flattered.
7. Pending obligations: Approved-Pending-Funds items with deadlines + unfunded gap total.
8. Health verdict: classic HEALTHY/WATCH/ACT (A.8) AND time-windowed verdict side by
   side, with drill-down of drivers.

Danger engine: rules table (rule_key, params JSONB, severity, enabled) evaluated hourly
for cash rules, daily for the rest. Initial rules with defaults per spec §14.2:
cash_runway (<4 weeks Danger, <8 Watch), payroll_coverage (next payroll > liquid cash →
Danger), coverage_ratio (<1.2 Watch, <1.0 Danger), receivables_90plus_spike (Watch),
loan_interest_burn (bands), zimra_overdue (Danger), deadline_breach (Danger),
petty_cash_variance (Watch), concentration_risk (Watch), conversion_loss (Watch).

Alert fan-out via NotificationService: in-app always; push+email Watch+; Danger →
push+email+Teams to ALL directors, repeated until acknowledged in-app. alerts table
(type, severity, subject ref, message, raised_at, acknowledged_by); every alert
deep-links to its drill-down; ack + resolution audited. Dedupe: an active unacknowledged
alert for the same rule+subject is refreshed, not duplicated.

Test: seed a runway-below-4-weeks scenario → all directors alerted within one simulated
hour and alert persists until acknowledged.
```

## Prompt 8 — Flutter App (Mobile + Web)

```
Build the Flutter client per spec §15.1 against the generated OpenAPI client.

Screens (role-aware via user_site_roles):
- Home: role dashboard tiles + persistent danger banner when active alerts exist.
- Approvals inbox: list with subject context, attachments, comments; one-tap
  approve/reject/return; biometric (local_auth) confirmation on money items.
- Requests: raise/track requisitions, travel allowances, petty cash vouchers; camera
  receipt capture; status timeline matching the shared lifecycle.
- Petty cash: custodian float view, vouchers, conversions, reconciliation count flow.
- Orders & receivables: order health board (colour-coded per A.2 states), ageing view,
  mark-serviced (+ milestones).
- Command centre: all 8 panels, alert feed with acknowledge.
- Director actions: raise withdrawal, co-approve, posted-awaiting-transfer list.
- Notifications: FCM push handling, deep links into subjects, ack.
- Web-only (Flutter Web): finance workstation (disbursements, transfers-complete,
  reports), admin panel (users/roles, matrix, thresholds, rates, statutory config,
  delegation, audit search), big-screen command centre.

Offline-first (timesheets in Phase 2 + draft requests now): Drift/SQLite local store,
outbound queue, sync service with conflict detection (server-wins + user-notified
conflict list). Everything else requires connectivity with graceful failure UI.

State: Riverpod; routing: go_router with role guards mirroring API RBAC (UI hides what
the API forbids). Localisation: en, Africa/Harare, USD/ZWG formatting side by side
where the spec shows both bases. Widget tests for approval flow, request lifecycle
rendering, and danger banner logic.
```

## Prompt 9 — Timesheets (Phase 2)

```
Implement timesheets per spec §12:
- timesheet_periods (site, month, status open|site-approved|locked);
  timesheet_entries (period, employee, date, hours_normal, hours_ot15, hours_ot20,
  ug_shift, night_hours, remarks).
- Mobile grid capture: employees down, days across (matches the current sheets' mental
  model); offline-first with sync (mines have dead zones).
- Validation at entry: configurable max hours/day, category exclusivity rules, anomaly
  flags (e.g. hours on a leave day via HR-lite leave records).
- Site Manager approval via the approval engine locks the period; corrections need an
  audited reopening request. Head office: 208-hour standard prefill, exceptions edited.
- Client manhours export: XLSX/PDF per site per month in the AES Manhours register format
  incl. SHE-relevant totals. Optional basic SHE incident/stats capture per site.
Tests: lock prevents edits; payroll cannot read unapproved periods; anomaly flagging.
```

## Prompt 10 — Payroll (Phase 2)

```
Implement the payroll engine per spec §13. It must reproduce the three observed patterns:
Mimosa (client-ratio, hourly, shift allowances, full statutory incl. NEC/MIPF), Unki
(similar), Head Office (fixed salaries, simpler statutory, Sage journal).

Tables: payroll_runs (site, period, status draft|checked|approved|paid|locked, fx_rate_id,
client_ratio_snapshot JSONB, prepared_by, approved_by), payroll_lines (per employee:
basic_usd, basic_zwg, cola, ug_allowance, night_allowance, other_allowances, gross, paye,
aids_levy, nssa_ee, nssa_er, zimdef, nec, mipf, nyaradzo, other_deductions, net_usd,
net_zwg), statutory_returns, bank_schedules, payslips.

Run lifecycle:
1. Open run (site, period): requires site-approved timesheet period. Pull hours, employee
   master (rate, grade, pay_mode, banks), CHOSEN exchange rate frozen into the run, and
   client ratio snapshot for client-ratio employees. Fixed-split employees (head office,
   directors incl. bespoke per-person splits) use employee-record split. Per-employee
   overrides supported.
2. Gross build-up: basic (hours × rate or fixed salary), OT at 1.5×/2.0×, underground
   allowance, night allowance, COLA, other — all split USD/ZWG by ratio or fixed split.
3. Statutory per currency from effective-dated statutory_rates: PAYE per ZIMRA bands with
   AIDS levy = 3% of PAYE, computed SEPARATELY for USD and ZWG portions; NSSA ee+er within
   insurable ceiling; ZIMDEF (employer); NEC + MIPF for mining sites; Nyaradzo/voluntary.
4. Draft review → FD approval via approval engine (preparer ≠ approver enforced) → lock.
   Approved runs are immutable; corrections only via a reversing correcting run (both kept).
5. Outputs: bank schedules per bank per currency (FBC pattern), PDF payslips delivered
   email/portal/app, statutory return summaries (PAYE, NSSA, ZIMDEF, NEC, MIPF, Nyaradzo)
   with due dates onto the compliance calendar, Sage journal CSV matching the existing
   "Sage Journal Entry" sheet format.
6. Posting: approved run posts salaries + employer costs to Accounts Ledger and Overheads
   automatically.

Privacy: payroll tables restricted to Finance/FD/Admin (+ separate director visibility);
bank accounts masked in UI except last digits; every payroll view/export audited;
encrypt sensitive columns at rest.

Acceptance: golden-file test — Mimosa March 2025 inputs reproduce the workbook's net pay
per employee in both currencies within rounding tolerance. Performance: 60+ employees
< 1 minute.

Also build HR-lite screens (employee CRUD, leave balances, grades/NEC classes, bank
details) and the statutory compliance calendar with reminders + remittance capture,
feeding the danger engine.
```

## Prompt 11 — Fabric / BI & Conversational Analytics

```
Build the analytics layer per spec §15.2–15.3:
1. Sync: PostgreSQL → Microsoft Fabric Lakehouse (mirroring if available on the tenant,
   else incremental scheduled pipeline). Document freshness SLA. Keep OLTP load off the
   transactional DB (read replica if needed).
2. Semantic model as a formal deliverable: business-friendly names, descriptions and
   synonyms for every table/column/measure (street rate, coverage ratio, order health,
   runway); ALL key metrics defined once as governed measures matching Appendix A exactly
   — no re-derivation in reports.
3. Security: replicate the RBAC matrix as RLS/OLS roles in Fabric; payroll tables
   EXCLUDED from general-audience models (separate FD/Director-only model); sensitivity
   labels applied.
4. Power BI: executive dashboards (multi-year trends, site profitability, client
   profitability, payroll cost evolution, conversion-loss analysis); distribution via
   Teams tabs + email subscriptions.
5. Copilot + Fabric Data Agent grounded on the Lakehouse with AES business context,
   surfaced in Teams; agent system context must state data freshness. Verify current
   Fabric capacity/SKU requirements and cost before finalising; size for AI workloads.
Acceptance: a ≥50-question bank of real business questions with expected answers passes;
a site-clerk-role query about director pay returns nothing.
```

## Prompt 12 — Business Development CRM (Phase 3)

```
Add the lightweight CRM per spec §17 on the same platform, auth and approval engine:
- contacts & organisations (linked to clients where existing), owner, source.
- interactions: calls, visits, emails, tenders with dates and outcomes.
- pipeline: Contact → Qualified → Proposal/Tender → Negotiation → Won/Lost with value
  estimates; kanban API + screens.
- One-action conversion: Won opportunity → Order or Contract in the finance core, linked
  and audited.
- Conversion analytics (contacts → opportunities → value won, per officer per period)
  added to the Fabric model.
Optional (flagged): in-app AI assistant answering transactional questions over the NestJS
API with the caller's own RBAC.
```

## Prompt 13 — Hardening & Go-Live

```
Run the pre-production hardening pass per spec §18:
1. Security: OWASP ASVS L2 self-assessment with findings fixed; TLS everywhere; secrets
   to vault; encryption at rest; MFA verified for privileged roles; biometric confirm
   verified on money approvals; dependency + container scanning in CI.
2. Data protection: Zimbabwe Cyber & Data Protection Act checklist (lawful basis,
   retention, subject access path); payroll access audit reports.
3. Reliability: daily automated Postgres backups + PITR, documented RPO 24h / RTO 8h,
   scripted quarterly restore drill; file-store versioning; status page for admins.
4. Performance: load test dashboards (<2s current-period views) and payroll (60+
   employees <1min); index review with EXPLAIN on the heaviest queries.
5. UAT support: seedable UAT environment with migrated real data; checklist generated
   from spec Appendix B traceability matrix (it doubles as the UAT checklist);
   parallel-run tooling comparing system outputs to the Excel workbook for a full month
   (payroll: two cycles) with automated diff reports.
6. Docs & training: role-based in-app help pages linked from every screen, per-module
   walkthrough scripts, train-the-trainer pack for Finance.
Deliver a go-live runbook: cut-over steps, rollback plan, first-week monitoring.
```

---

## Usage Tips

- Run one prompt per session/branch (`stage/<n>-<name>` → PR into `main` on Vulture-Nest/aes-platform); require the agent to finish with passing tests + migration before moving on.
- Protect `main` (require PR + green CI) and add repo secrets for CI before Stage 2 (Entra ID client IDs, etc.).
- After each stage, re-run the Appendix A golden test suite — it is the regression net for the whole finance core.
- If the agent must invent any business rule not covered here or in the PDF, it should stop and ask — statutory numbers especially (VAT, PAYE bands, NSSA) are effective-dated config to be confirmed with ZIMRA/a tax practitioner, never hardcoded.
