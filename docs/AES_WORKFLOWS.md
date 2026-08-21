# AES — Workflows & Navigation Guide (showcase edition)

A practical, verified map of every money/approval workflow in AES: **who** does it,
**which app + page** they use, the **states** it moves through, and the **rules** the
engine enforces. Use this to demo confidently.

> **Verified live** on the shared deployment (2026-08-20): the **Cash requisition**
> flow (sequential approval) and the **Budget** flow (parallel dual-authorization)
> were driven end-to-end through the UI. Every other workflow below runs on the *same*
> approval engine and is documented from the system design + `E2E_TEST_PLAN.md`.

---

## 0. The two apps (the #1 thing to know)

AES ships **two web frontends** that talk to one API:

| App | URL (prod) | Who | What they do here |
|-----|-----------|-----|-------------------|
| **Web app** (end-user) | `aes.<host>` | Ops Staff, Site Clerk, Site Manager | **Raise** requisitions/travel/petty-cash, capture timesheets. Its *Approvals* page handles **only timesheets + petty cash**. Flat sidebar. |
| **Admin console** (config + finance) | `admin.<host>` | Finance, Directors, Site Managers (for money approvals), SysAdmin | **My Approvals** for all money workflows; **Workflows →** module pages where Finance **settles** (disburse); all configuration. Grouped/collapsible sidebar. |

**Rule of thumb:** *raise in the web app → **approve & settle in the admin console** → never approve your own.*

The web *Approvals* page even says it: *"Requisitions, travel and other money approvals
are handled in the admin console."*

---

## 1. The universal shape

Every money/approval workflow is the same three-beat pattern:

```
RAISER creates + submits  →  APPROVER(S) decide (My Approvals)  →  FINANCE settles (Disburse/Post)
```

Two invariants hold **everywhere**:

1. **Approvals happen in the `My Approvals` inbox — not on the module page.** A module
   page (e.g. *Workflows → Requisitions*) only offers **raise** and, after approval,
   **settle (Disburse)**. It never shows an Approve button.
2. **No self-approval (segregation of duties).** Whoever raises an item cannot approve
   or settle it. *(Verified: the requester's Submit action disappears once submitted.)*

**Approval modes** (from the seeded approval matrix):
- **SEQUENTIAL** — step 1, then step 2, … (e.g. requisition: Site Manager, then Finance Director if ≥ threshold).
- **PARALLEL** — several approvers hold it at once; item advances only when **all** approve (e.g. budget: OD **and** FD). *(Verified: after OD approved, the budget stayed SUBMITTED until FD also approved, then went ACTIVE.)*
- **EITHER** — any one of a set can approve (e.g. director withdrawal: any *other* Director).

---

## 2. Demo / test accounts (all `@aes.local`)

| Role | Email | Password | Scope |
|------|-------|----------|-------|
| System Administrator | `admin@aes.local` | `ChangeMe!123` | Global |
| Finance Director (FD) | `fd@aes.local` | `FdPassword!123` | Global |
| Finance Officer (FO) | `fo@aes.local` | `AesTest!234` | Global |
| Operations Director (OD) | `od@aes.local` | `AesTest!234` | Global |
| Director | `director@aes.local` | `AesTest!234` | Global |
| Site Manager | `sitemgr@aes.local` | `AesTest!234` | **Mimosa** |
| Site Clerk / Timekeeper | `clerk@aes.local` | `AesTest!234` | **Mimosa** |
| Operations Staff | `opsstaff@aes.local` | `AesTest!234` | Global |
| Auditor | `auditor@aes.local` | `AesTest!234` | Global — **read-only** |

Recreate with `apps/api/prisma/demo-users.ts`. **These are weak defaults — change them before any real use.**
Login note: the API auth route is `POST /v1/auth/login` (URI-versioned; no `/api` prefix on the API subdomain).

---

## 3. At-a-glance — who raises, who approves, who settles

| Workflow | Raiser | Approver(s) | Settler / result |
|----------|--------|-------------|------------------|
| **Cash requisition** ✅ | Ops Staff / Clerk / Site Mgr | Site Manager → Finance Director *(2nd step only if ≥ $5,000)* | **Finance Officer — Disburse** |
| **Travel & allowances** | Ops Staff / Clerk | Site Manager → Finance Director *(≥ $5,000)* | Finance Officer — Disburse → traveller **retires** it |
| **Petty-cash withdrawal** | Site Clerk | Site Manager *(below threshold)* **or** Finance Director *(≥ threshold)* | posts on approval |
| **Budget** ✅ | Finance Officer | Ops Director **and** Finance Director *(parallel — both)* | **Active** once both approve |
| **Director withdrawal** | Director | any **other** Director *(EITHER)* | posts on co-approval |
| **Timesheet** | Site Clerk / Timekeeper | Site Manager *(approve → lock)* — **in the web app** | locked for payroll |
| **Payroll → returns** | Finance Officer *(draft / run)* | Finance Director *(approve)* | Finance Officer *(files statutory returns)* |
| **Order → revenue** | Ops Staff / Finance | — *(no approval)* | revenue posts when order **serviced** |

✅ = verified live end-to-end.

---

## 4. Workflow detail + navigation

### 4.1 Cash requisition — *raise → approve → disburse* ✅ VERIFIED
| # | Actor | Where | Action |
|---|-------|-------|--------|
| 1 | **Requester** (Ops Staff/Clerk/Site Mgr) | Web app → **Requests** → *New requisition* | purpose, amount, currency, required-by → **Submit** (`DRAFT → SUBMITTED`) |
| 2 | **Site Manager** | **Admin console → My Approvals** | **Approve** — step 1 (any amount) |
| 3 | **Finance Director** | Admin console → My Approvals | Approve — step 2, **only if amount ≥ $5,000** |
| 4 | **Finance Officer** | Admin console → **Workflows → Requisitions** | **Disburse** (pick source account + payment ref) → `CLOSED` |

- **States:** `DRAFT → SUBMITTED → APPROVED PENDING FUNDS → CLOSED`.
- **Funds control:** if the ledger can't cover it, Disburse warns *"Funds short — disbursing anyway is a Finance override."* *(Verified.)*
- **SoD:** the requester cannot disburse their own; `< $5,000` needs only the Site Manager. *(Verified with a $1,200 requisition: Site-Manager-only, then FO disbursed.)*

### 4.2 Travel & allowances — *raise → approve → disburse → retire*
Same engine/threshold as requisitions. Web app → **Travel** to raise; approvals in the
admin console **My Approvals**; **Workflows → Travel** to disburse. After the trip the
traveller **retires** the advance (receipts vs. advance; refund or top-up the difference).

### 4.3 Petty cash
Site Clerk raises a voucher (Web → **Petty Cash**). Approval routes by threshold:
**Site Manager** below the configured limit (approved in the **web app**), or **Finance
Director** at/above it (**admin console** My Approvals). Posts to the site's petty-cash
float on approval. Floats are the `Petty Cash - <Site>` ledger accounts.

### 4.4 Budget — *parallel dual authorization* ✅ VERIFIED
| # | Actor | Where | Action |
|---|-------|-------|--------|
| 1 | **Finance Officer** | Admin console → **Workflows → Budgets** → *New budget* | name, currency, line items → **Submit** → *"Submit for co-approval?"* |
| 2 | **Ops Director** | Admin console → My Approvals | Approve *(step: OPS DIRECTOR)* |
| 3 | **Finance Director** | Admin console → My Approvals | Approve *(step: FINANCE DIRECTOR)* |
| 4 | *system* | — | **ACTIVE** only after **both** approve; actual spend tracks % consumed per line. A **Return** by either restarts the cycle. |

- **States:** `DRAFT → SUBMITTED → ACTIVE`. *(Verified: OD approve left it SUBMITTED; FD approve flipped it to ACTIVE — proving parallel.)*

### 4.5 Director withdrawal
A **Director** raises; **any other Director** (or the Finance Director) **co-approves**
in the admin console My Approvals (mode = EITHER). Self-approval is blocked by the
engine. Posts on co-approval.

### 4.6 Timesheets  *(approval lives in the WEB app)*
Site Clerk / Timekeeper **captures** timesheets (Web → **Timesheets**). The **Site
Manager approves → locks** them in the **web app → Approvals** page (this is the one
approval that is *not* in the admin console). Locked timesheets feed payroll.

### 4.7 Payroll → statutory returns
Finance Officer **drafts/runs** payroll (admin console → **People & Payroll**), Finance
Director **approves**; the system produces payslips + a bank schedule and **auto-creates
statutory obligations** (ZIMRA/NSSA etc.), which the Finance Officer then **files**.

### 4.8 Order → revenue *(no approval chain)*
Ops Staff / Finance create an **Order** (Sales & CRM). No approval; **revenue is
recognised when the order is marked *serviced*** (visible on the admin Dashboard's
Revenue & profit panel).

---

## 5. Seeded approval matrix (the rules the engine uses)

| Module | Step | Approver role | Mode | Applies when |
|--------|------|---------------|------|--------------|
| requisition | 1 | SITE_MANAGER | sequential | amount ≥ $0 (always) |
| requisition | 2 | FINANCE_DIRECTOR | sequential | amount ≥ $5,000 |
| travel | 1 | SITE_MANAGER | sequential | always |
| travel | 2 | FINANCE_DIRECTOR | sequential | ≥ $5,000 |
| budget | 1 | OPS_DIRECTOR | **parallel** | always |
| budget | 1 | FINANCE_DIRECTOR | **parallel** | always |
| director_withdrawal | 1 | DIRECTOR | **either** | always |
| petty_cash | 1 | FINANCE_DIRECTOR | sequential | ≥ $100 |

*(Configurable in the admin console; seeded by `apps/api/prisma/seed.ts`.)*

---

## 6. Suggested demo script (≈10 min)

1. **Login map** — show `aes.<host>` (web, flat nav) vs `admin.<host>` (grouped nav). Point out *approvals live in the admin console*.
2. **Requisition (sequential + SoD + funds override):** `opsstaff` raises $1,200 in Web → Requests → Submit. Note the action vanishes (SoD). `sitemgr` approves in admin My Approvals. `fo` disburses in Workflows → Requisitions (show the *funds-short* override). Status → CLOSED.
3. **Budget (parallel dual-auth):** `fo` raises in Workflows → Budgets → Submit. `od` approves → still SUBMITTED. `fd` approves → **ACTIVE**. This is the "wow — both directors must sign" moment.
4. **Site scoping / RBAC:** log in as `sitemgr` (Mimosa) and show they see only Mimosa; log in as `auditor` and show read-only (no action buttons).
5. **Dashboard:** back on the admin **Dashboard**, show cash position, danger alerts, revenue & profit.

---

*Generated from the AES E2E test plan + live verification. Roles/thresholds are configurable; treat amounts as examples.*
