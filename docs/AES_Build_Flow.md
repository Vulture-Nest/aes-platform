# AES Operations & Finance Management System — Comprehensive Build & Design Flow

Companion to the *Detailed System Design & Process Flow Document v1.0*. This file sequences the entire build into stages with dependencies, deliverables and acceptance gates. Each stage maps to a numbered prompt in `AES_Agent_Prompts.md`.

**Stack:** NestJS (TypeScript) · Flutter (mobile + web, one codebase) · PostgreSQL 16 · Prisma · Redis/BullMQ · Microsoft Entra ID (OIDC) · Microsoft Fabric/Power BI · FCM + Graph (email/Teams)

---

## Stage Map (dependency order)

```
S0 Repo & environment scaffold
 └─ S1 Foundations: auth, RBAC, audit, settings, exchange rates, notifications
     └─ S2 Generic approval engine
         ├─ S3 Financial core: clients, contracts, orders, expenses, loans, tax ledger, Accounts Ledger
         │    └─ S4 Data migration from Excel (parity gate A.10)
         ├─ S5 Workflow modules: requisitions, travel, petty cash, budgets, director withdrawals
         └─ S6 Command Centre + danger engine + alerts   ← owner's primary deliverable; pull forward
              └─ S7 Flutter app (mobile + web) incl. offline
                   ├─ S8 Phase 2: timesheets → payroll → statutory outputs → Sage → HR-lite
                   ├─ S9 Fabric/Power BI + conversational analytics
                   └─ S10 Phase 3: Business Development CRM
                        └─ S11 Hardening, UAT, parallel run, go-live
```

---

## S0 — Repository & Environment Scaffold

**Build:** Monorepo (`apps/api` NestJS, `apps/app` Flutter, `packages/shared` DTO/contract types), Docker Compose (Postgres 16, Redis, MinIO for local file store), CI (lint, test, migration check), environment config (.env schema, secrets vault placeholder), OpenAPI generation wired.
**Gate:** `docker compose up` gives a healthy API skeleton + DB + Redis; CI green.

## S1 — Foundations

**Build:**
- **Auth:** OIDC against Entra ID; user provisioning on first login; `users` table linked to optional `employees`; MFA-required flag for FD/Director/Admin roles; biometric-confirm contract for mobile money approvals.
- **RBAC:** roles per §4 (Site Clerk, Site Manager, Ops Staff, Finance Officer, FD, OD, Director, SysAdmin, Auditor read-only), assigned **per user per site** (`user_site_roles`). NestJS guards on every endpoint + Postgres row-level security mirroring.
- **Audit:** append-only `audit_log` (actor, table, record_id, action, before/after JSONB, timestamp) via Postgres triggers + service-level writes for approvals/status changes.
- **Reference data:** `sites`, `settings/statutory_rates` (all effective-dated: VAT %, ZIMRA interest %, NSSA/ZIMDEF/NEC/MIPF params, PAYE bands per currency), `exchange_rates` append-only (official + parallel, effective-dated, never overwritten).
- **Notification service:** channel abstraction (push/FCM, email via Graph, Teams) with per-user channel preferences; fan-out rules by severity.
- **Admin panel API:** users/roles, sites, thresholds, approval-matrix CRUD, rate entry, statutory rates, delegation rules (approver → alternate for date range), audit log search.
**Gate:** SSO login works; a Site Clerk at Mimosa cannot read Unki rows (RLS test); rate history reproduces any historical rate; audit rows written for every mutation.

## S2 — Generic Approval Engine (most important build decision)

**Build:** One engine for all approvable items (requisition, travel, budget, petty cash ≥ threshold, director withdrawal, payroll run, timesheet period, budget change request, petty cash top-up).
- `approval_matrix` (module, amount band, currency, site, step order, approver role, mode sequential | parallel | either) instantiates an approval chain on submission.
- Decisions: Approve / Reject / Return-for-correction (+comment). Return → requester-editable; Reject → closed.
- Hard rules: **no self-approval ever**; recorder-of-payment ≠ requester; delegation substitution when active.
- SLA timers (BullMQ): reminder at T1 (e.g. 24h), escalation at T2 to next role/directors.
- Approvals inbox API; every decision → `approvals` table + audit log; subject status advances automatically.
**Gate:** Matrix change re-routes without code change; self-approval blocked in tests; SLA escalation fires in a clock-mocked test.

## S3 — Financial Core

**Build:** `clients`, `contracts`, `contract_claims`, `orders`, `order_receipts`, `order_expenses`, `general_expenses`, `overheads`, `loans`, `loan_repayments`, `loan_interest`, `tax_ledger`, `other_tax_debt`, `zimra_assessments`, and the double-entry **Accounts Ledger** (`accounts`, `ledger_entries`) that every approved money event posts to.
- Encode **Appendix A as unit-tested domain services** (not report arithmetic): order financials (A.1), order payment status + health state machine incl. PARTIALLY SERVICED via optional service milestones (A.2 + B.2a), contract claim variance (A.3), loan interest — flat-on-principal default plus reducing-balance option per loan (A.4), tax ledger consolidation (A.5), ZIMRA reconciliation (A.6), performance (A.7), classic HEALTHY/WATCH/ACT verdict (A.8).
- Multi-currency storage rule everywhere: `(amount, currency, fx_rate_id, rate_type)`; ZWG receipts valued at official *and* street basis side by side.
- Nightly BullMQ jobs: loan + ZIMRA interest accrual, order health re-evaluation, contract status transitions; alerts on transitions into red states.
- Operational reports: Orders Dashboard, Receivables, VAT obligations, Tax ledger/summary, Performance, Financial Summary (XLSX/PDF/CSV server-side).
**Gate:** Appendix A unit-test suite passes; a receipt posts ledger entries and flips order health correctly; interest accrual is idempotent (re-running a day doesn't double-charge).

## S4 — Data Migration (parity gate)

**Build:** One-time scripted import from the Operational Cashflow workbook (clients, contracts, orders, expenses, loans, tax balances) + employees from the three payrolls. Reconciliation report comparing every computed figure to the workbook on the same report date.
**Gate (A.10):** every order's health, payment status, profit, loan interest, tax lines, ZIMRA dashboard, Performance and Financial Summary verdict match within **$0.01 per line using classic rules**. Finance signs off. Only then do IMPROVE variants (effective-dated rates, split PAYE/VAT debt, reducing-balance interest) activate.

## S5 — Workflow Modules

All use the S2 engine and the shared lifecycle: Draft → Submitted → Approved/Rejected/Returned → **Funds check** → Approved-Ready-to-Pay | Approved-Pending-Funds → Disbursed → (travel) Retired → Closed.
- **Cash requisitions (§8):** approve on merit only — funds never block approval; on approval snapshot live cash position; daily job re-tests Pending-Funds items vs ledger and required-by dates; escalation 3 days out; missed deadline → Danger alert. Disbursement captures source account + reference and posts to ledger.
- **Travel allowances (§8):** per-diem auto-computed from admin rate table (grade/destination class); advance → retirement/acquittal with receipts and refund-due/owed reconciliation; unretired > N days → FD dashboard + reminders.
- **Petty cash (§9):** float per site per currency with custodian; below-threshold voucher = Site Manager confirm, ≥ threshold (e.g. USD 100) = FD approval before cash leaves; conversions record both legs + achieved rate + variance vs official (conversions report per site); periodic in-app cash count — variance beyond tolerance alerts FD and **locks withdrawals**; imprest replenishment.
- **Budgets (§10):** Finance drafts with line items; **parallel co-approval OD + FD** (both must approve; either Return restarts); Active budget tracks actuals in real time with warn-at-85% / alert-at-100%; revisions versioned; Budget Change Requests via same dual path.
- **Director withdrawals (§11):** request → second-director co-approval → posted to ledger as "Posted — Awaiting Transfer" (visible in summary immediately) → manual transfer, method + reference captured → Completed; nudge job for stale posted items.
**Gate:** §18.3 acceptance anchors for requisitions, petty cash, budgets and withdrawals all pass as automated tests.

## S6 — Business Health Command Centre & Danger Engine

**Build:** API + jobs powering the eight panels (§14.1): cash position (official + street USD-equivalent, 30/60/90-day trend), money in vs out, debt & interest watch, orders vs payroll & expenses (coverage ratio headline), receivables ageing, tax exposure, pending obligations, health verdict (classic A.8 + time-windowed successors side by side).
- Danger rules engine (hourly cash / daily rest), admin-tunable per §14.2: cash runway (<4w Danger, <8w Watch), payroll coverage, coverage ratio (<1.0 Danger, <1.2 Watch), receivables spike, interest burn, ZIMRA overdue, deadline breach, petty cash variance, concentration risk, conversion loss.
- Fan-out: in-app always; push+email Watch+; Danger → push+email+Teams to **all directors, repeated until acknowledged in-app**; every alert deep-links to its drill-down; ack/resolution audited.
- Include a corporate income tax **provision estimate line** (25% + 3% AIDS levy) in the health view so the verdict isn't flattered (§16.4); full computation stays with the tax practitioner.
**Gate:** Runway-below-4-weeks scenario alerts all directors within one hour and persists until acknowledged (§18.3). A first useful version ships on the financial core alone — do not wait for payroll.

## S7 — Flutter App (Mobile + Web)

**Build:** Role-aware screen map (§15.1): Home with danger banner, Approvals inbox (one-tap, biometric confirm on money items), Requests, Petty cash custodian views, Orders & receivables board, Command Centre, Director actions, Notifications/ack. Flutter Web adds the finance workstation, payroll screens (S8) and admin panel.
- **Offline-first** for timesheets and draft requests: local SQLite/Drift persistence, sync with conflict detection; everything else online-only.
**Gate:** End-to-end demo of each §18.3 anchor from the UI; offline timesheet capture syncs cleanly after airplane-mode test.

## S8 — Phase 2: Timesheets → Payroll → Statutory → Sage → HR-lite

Order matters: HR-lite employee master fields are needed by both, so build the *table* in S3/S4 and the *screens* here.
- **Timesheets (§12):** daily grid (employees × days), five categories (Normal, OT1.5, OT2.0, Underground, Night); entry validation (max hours/day, category exclusivity, leave-day anomaly flags); Site Manager approves → period locks; reopening request audited; head office 208-hour prefill; client manhours XLSX/PDF export per site per month (incl. SHE totals).
- **Payroll (§13):** run per (site, period): pulls approved hours, employee master, frozen fx rate + client ratio snapshot; gross build-up split USD/ZWG by client ratio or fixed split; statutory per currency — PAYE per effective-dated ZIMRA bands + AIDS levy (3% of PAYE) computed separately per currency, NSSA (ceiling), ZIMDEF, NEC/MIPF (mine sites), Nyaradzo/voluntary; per-employee overrides. Draft → FD approval → lock; reversal only by correcting run. Outputs: bank schedules per bank per currency, PDF payslips (email/portal/app), statutory return summaries onto compliance calendar, Sage journal CSV. Approved run auto-posts to Ledger + Overheads.
- **HR-lite:** employee records, leave balances, grades/NEC classes, bank details (masked in UI except last digits), start/end dates.
- **Compliance calendar (§16.3):** remittance deadlines with reminders + remittance capture; feeds danger engine.
**Gate:** Mimosa March 2025 payroll re-run reproduces workbook net pay per employee, both currencies, within rounding tolerance (§18.3). Payroll runs for 60+ employees in <1 minute. Two parallel payroll cycles before cut-over.

## S9 — Fabric / Power BI & Conversational Analytics

**Build:** PostgreSQL → Fabric Lakehouse (mirroring or scheduled pipeline); Power BI semantic model as a formal deliverable — business-friendly names/descriptions/synonyms, all key metrics as governed measures matching Appendix A exactly; RBAC replicated as RLS/OLS; payroll excluded from general models (separate FD/Director model); sensitivity labels; Copilot + Fabric Data Agent in Teams with data-freshness disclosure. Verify current Fabric capacity/SKU requirements before committing.
**Gate:** ≥50-question test bank of real business questions answers correctly; site clerk asking about director pay gets nothing.

## S10 — Phase 3: Business Development CRM

**Build:** Contacts & organisations (linked to clients), interactions log, pipeline (Contact → Qualified → Proposal/Tender → Negotiation → Won/Lost) with value estimates; Won converts to Order/Contract in one action; conversion analytics per officer per period in Fabric. Optional: in-app AI assistant over the API with same RBAC.
**Gate:** Won opportunity produces a live order visible to the finance core with full audit trail.

## S11 — Hardening, UAT & Go-Live

- Security: OWASP ASVS L2 review, TLS everywhere, secrets vault, encryption at rest, payroll view/export auditing, Zimbabwe Cyber & Data Protection Act review.
- NFR checks: dashboards <2s, 99.5% availability target, RPO 24h / RTO 8h, daily backups + PITR + quarterly restore drill.
- Per stage: UAT with Finance on real data; ≥1 full month parallel run vs Excel (payroll: two cycles).
- Docs & training (B.2b): role-based in-app help pages, screen-recorded walkthroughs per module, train-the-trainer at each phase UAT.

---

## Cross-Cutting Rules (apply to every stage)

1. **Approve first, fund second** — fund availability never blocks approval; it drives status and escalation.
2. **Human executes money movement** — system prepares/approves/posts/instructs; a person transfers and captures the reference.
3. **Multi-currency storage rule** — every money value stores amount, currency, fx_rate_id, rate_type; no destructive conversion.
4. **Effective-dated everything** — rates, statutory parameters, thresholds, PAYE bands; config, not code.
5. **Audit everything** — inserts, updates, approvals, status changes, payroll views/exports; append-only.
6. **Excel is output only** — never the data store; all current workbook reports preserved as system exports.
7. **Classic rules first, IMPROVE second** — migration parity ($0.01) with the workbook's rules before improved variants activate.
