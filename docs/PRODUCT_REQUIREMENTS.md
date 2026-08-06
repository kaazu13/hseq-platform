# Product Requirements Document

## 1. Product Summary

A multi-tenant SaaS platform for construction and industrial contractors that unifies **workforce operations** (scheduling, timesheets, employee records) with **HSEQ management** (Health, Safety, Environment, Quality — inspections, incidents, corrective actions, digital sign-off).

Each customer ("Company" or "Company") operates in a fully isolated tenant. A single person may belong to and work across **more than one Company** (e.g., a subcontractor engaged by two client companies) — but within each Company they see only that Company's data, selected one at a time as their active company. Companies remain fully isolated tenants from one another regardless of shared membership.

## 2. Goals

- Replace paper/Excel-based site safety processes with structured, auditable digital forms.
- Give operations managers a single place to see who is scheduled, who showed up, and what they worked on.
- Give HSEQ managers real-time visibility into inspections, incidents, and open corrective actions across all active projects.
- Provide a defensible audit trail (who did what, when) for regulatory and insurance purposes.
- Work reliably from a phone on a job site (poor connectivity, gloves, sunlight-readable UI), not just from an office desktop.

## 3. Non-Goals (initial release)

- Payroll processing / payment disbursement, and **direct integration with any payroll provider**. v1 is **export-only**: the platform produces CSV and Excel-friendly (XLSX) exports of worked hours for a human or a downstream system to consume. Provider-specific integrations (e.g., ADP, Gusto, Xero) are a possible later module, not v1 scope.
- **Public self-service company registration.** In v1, Companies are created manually by a Platform Super Admin only — see [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-company-membership-model) and [IMPLEMENTATION_PLAN.md — M4](./IMPLEMENTATION_PLAN.md#m4--company-onboarding--user-management). There is no "sign up your company" flow to design or build yet.
- **Qualified or advanced legal e-signature compliance** (e.g., eIDAS Advanced/Qualified Electronic Signature, an ESIGN-Act-certified provider integration). v1 digital signatures are authenticated electronic attestations, not a certified e-signature product — see [§6.10](#610-digital-signatures) and [ARCHITECTURE.md §10](./ARCHITECTURE.md#10-file-storage-attachments-photos-signatures). A dedicated e-signature provider integration is a possible later, optional module.
- Native mobile apps (initial release is a responsive web app; a native/PWA wrapper is a future consideration).
- Offline-first data entry with conflict resolution (initial release assumes intermittent connectivity is tolerated by the UI, not a full offline queue/sync engine).
- Public API for third-party integrations (internal API only in initial release).
- Multi-language i18n (English only in initial release; copy should avoid hard-coding assumptions that block future translation).

## 4. Primary Personas

| Persona | Represents role(s) | Core needs |
|---|---|---|
| Platform Owner | Platform Super Admin | Onboard/suspend companies, monitor system health, never touches tenant business data directly |
| Company Admin | Company Admin | Configure the company, manage users/roles, billing-adjacent settings, full visibility into their company |
| Ops Lead | Operations Manager, Project Manager, Planner | Schedule crews, manage projects/locations, resolve timesheet discrepancies |
| Safety Lead | HSEQ Manager, Inspector | Run inspections/audits, manage incidents and corrective actions, own compliance reporting |
| Site Lead | Foreman | Run daily toolbox talks/LMRA with the crew, log observations, approve crew hours |
| Field Worker | Employee | Clock hours, complete assigned safety forms, view own schedule/documents, sign forms |
| Back Office | *(no dedicated role currently — see [§10 open question 4](#10-open-product-questions))* | Reconcile worked hours, manage employee documents/certificates, export timesheet data |

A real person may map to more than one persona at once within the same company (e.g., someone who is both a Foreman and a certified Inspector), and may hold different personas in different companies if they belong to more than one. See [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md) for the full role list, the multi-role model, and the permission matrix.

## 5. Core Modules (Operations)

### 5.1 Companies / Companies
Tenant root entity. Holds company profile, settings, and subscription/plan status. Every tenant-owned record traces back to exactly one company. **Created only by a Platform Super Admin in v1** — no self-service registration.

### 5.2 User Accounts & Company Membership
A user's authentication identity (Supabase Auth user + a `profiles` record holding identity info only — name, phone) is separate from their relationship to any given company. A person's membership in an company — their status there (invited/active/suspended/removed) and the role(s) they hold there — is tracked independently, and a person may hold memberships (with different roles) in **more than one company**. When a user belongs to more than one company, they select one as their **active company**; everything they see and do is scoped to that selection until they switch. See [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-company-membership-model) for the structure and how active-company selection works.

### 5.3 Employees
The company employment record for a person working for the company: name, employee number, position, phone/work email, employment status (active/inactive/on leave/terminated), birth/start/end date. This platform models **employees only** — there is no generic "person," visitor, contractor, or external-company concept; anyone the company needs to track as working for it is an employee record.

An employee record is deliberately **not** the same thing as a login identity or a tenant-membership grant, and the three are allowed to exist independently of each other:
- `auth.users` (Supabase Auth) is the login identity — email/password, session.
- `profiles` is the platform identity tied to that login — display name, phone, active-company preference.
- `company_memberships` + `membership_roles` + `roles` determine which company(s) a profile can access and what it's permitted to do there — this is the **one and only** role system; employees never get a second, parallel one.
- `employees` is the HR record itself, with an optional `profile_id` linking it to a platform identity.

An employee record can exist entirely on its own — created by an admin before the person has ever logged in (`account_status: 'draft'`) — and stays a valid, useful record even if it's never linked to an account at all (e.g., historical/terminated employees, or a company that manages HSEQ paperwork for people without giving them platform access). Roles only become assignable once the record is linked to a `profile_id` with an active company membership; account activation/invitations themselves are a later milestone, not part of this one. Employees do not enter their own worked hours in this model — payroll/timesheet calculation is explicitly out of scope for the employee record itself (see [§5.7](#57-worked-hours--timesheets) and [§3](#3-non-goals-initial-release)).

Every employee has a permanent, immutable `employee_number` (format `<ORGANIZATION-PREFIX>-00001`, e.g. `VALUTRIS-00001`), generated automatically in the database at creation time — never entered manually, never reused after archiving, and never changeable afterward, by anyone, through the application (see [DATABASE_SCHEMA.md — `employees`](./DATABASE_SCHEMA.md#employees--tenant--implemented) for the generation mechanism). This number, not the internal database id, is what appears in employee URLs and everywhere else the record is referenced in the UI.

Whether an employee **record** is archived (`archived_at`) and what its **account/access lifecycle** currently is (`account_status`) are two independent facts, not one — a decision an earlier revision of this milestone got wrong by using `account_status = 'archived'` as the archive signal in several places, since corrected. `archived_at` is the only thing that decides whether a record is hidden from the default list, and whether the profile shows an Archive or Restore action. `account_status` (draft / invited / pending_activation / active / suspended / archived) is displayed independently and exists to describe login/access state — it must be free to vary on its own for the future invitation, suspension, and multi-company-access work described in [§11.2](#112-one-global-identity-many-company-scoped-employee-records), none of which would be possible if it were also overloaded as the archive flag.

**Implemented, Employment Lifecycle milestone:** `employment_status`/`start_date`/`end_date` are no longer directly editable fields — they're a synced snapshot of `employee_employment_periods` ([§11.4](#114-employment-history-implemented-narrower-than-originally-envisioned)), the record of every continuous stretch this person has worked for the company. Ending employment (recording an end date, a reason, an optional note, who did it, and when) and rehiring (opening a new period on the **same** record — never a new one, so the employee number and every other field carry over) are the only two ways this state changes; the general edit form no longer touches it at all. Archiving/restoring the record itself (previous paragraph) stays completely independent of this — ending someone's employment does not archive their record, and rehiring does not restore an archived one; each requires its own explicit action.

**Documented future rule, not implemented in this milestone:** archiving or terminating a linked employee (one with a `profile_id` and an company membership) must only remove or suspend that person's access to **this** company — never delete or disable their global login (`auth.users`/`profiles`), since the same identity may hold an active, unrelated membership in a different company (see [§11.2](#112-one-global-identity-many-company-scoped-employee-records)). Today, archiving an employee with no linked account (the only case this milestone's UI can actually reach, since nothing yet sets `profile_id`) only ever touches the `employees` row itself — there is no account/membership to suspend yet.

### 5.4 Projects
**Implemented**, Projects & Team Management milestone. A contracted job/site the company is executing: name, client, optional project number/code, description, a status lifecycle (**planning → active → completed → archived** — "archived" is the retirement mechanism, not a separate delete), start/end date, and a free-text location. A project may have more than one Project Manager and more than one HSEQ Manager (and HSE Officer, and Inspector) simultaneously — assigned on the project's Assignments tab, after creation, the same "create first, assign roles second" pattern already established for employees. See [DATABASE_SCHEMA.md — `projects`](./DATABASE_SCHEMA.md#projects--tenant--implemented) and [ROLES_AND_PERMISSIONS.md §2](./ROLES_AND_PERMISSIONS.md#2-multi-company-multi-role-model) for how assignment-driven project visibility works.

Each Project contains one or more **Teams** — a crew of employees working on it, with a colored header (a fixed, Google-Calendar-style palette, never a free color picker), an optional code, and a manually-controlled display order. Within one project, an employee may belong to at most one active team at a time; ending that assignment and starting a new one (a "move") is atomic. The Teams page is a card grid, not a table, and answers exactly one question — "who is currently working in each team" — never showing historical assignments (those are preserved for audit, not displayed). See [DATABASE_SCHEMA.md — `teams`](./DATABASE_SCHEMA.md#teams--tenant) for the full design.

### 5.5 Project Locations & Work Areas — not implemented this milestone
Hierarchical breakdown of a project site (e.g., Project → Zone → Work Area) used to scope schedules, inspections, and incidents to a physical location, and to support location-specific risk data (e.g., a scaffold's work area). Deferred — Projects & Team Management's `projects.location` is a single free-text field, not this hierarchy; a future milestone may build it if/when work-area-scoped scheduling or HSEQ records need it.

### 5.6 Daily Workforce Scheduling
Assigns employees to a project/work area for a given date and shift. Foremen build the day's crew list; employees see their assignment.

### 5.7 Worked Hours & Timesheets
Actual clocked/reported hours per employee per day, linked to the schedule entry where applicable. Supports Foreman approval workflow before hours are considered final.

### 5.8 Hour Discrepancy Requests
Structured way for an employee or Foreman to flag a mismatch between scheduled and worked hours (or a missed clock event) and route it for review/approval, producing an auditable resolution instead of an off-system conversation.

**Documented future rule, not implemented in this milestone:** an employee may request review of multiple different workdays, but only one review case may exist per employee per work date at a time. A workday cannot be requested again while a case for it is pending, or after it has been answered, unless an authorized administrator explicitly reopens it — which requires a mandatory reason and produces its own audit record. This constraint belongs to whichever future milestone actually builds hour discrepancy requests; it is recorded here now so that milestone doesn't have to rediscover it.

### 5.9 Employee Documents & Certificates
Stores required documents (ID, right-to-work, training certificates, medical clearance) with expiry tracking so HSEQ/Ops can see who is out of compliance before it becomes a site issue. Expiry produces staged notifications (60/30/14/7 days before expiry, on the expiry date, and recurring while expired and unresolved) to the employee, their direct manager where assigned, the HSEQ Manager, and Company Admin — see [§7 below](#7-certificate-expiry-notification-schedule).

### 5.10 Notifications
In-app (and later email/push) notifications for assignment changes, approvals needed, expiring certificates, overdue corrective actions, new incidents, etc.

### 5.11 Reports & Dashboards
Role-scoped views summarizing hours, attendance, open safety items, incident trends, and compliance status. Exportable where relevant — timesheets export to **CSV and Excel-friendly (XLSX)** formats for v1; no payroll-provider integration.

## 6. HSEQ Modules

### 6.1 LMRA (Last Minute Risk Assessment)
Short, structured go/no-go safety check completed by a crew immediately before starting a task, tied to a project/work area and the people present.

### 6.2 Toolbox Talks
Record of a short safety briefing given to a crew: topic, presenter, date, and attendee sign-off.

### 6.3 Scaffold Inspections
Structured periodic inspection of a scaffold structure against a checklist, with pass/fail per item, tag status (e.g., green/yellow/red tag), and photo evidence.

### 6.4 Safety Walks
Scheduled or ad-hoc walkthrough of a work area by a manager/inspector to proactively identify hazards, independent of a specific incident.

### 6.5 Corrective Actions
A tracked remediation task raised from any HSEQ source (inspection finding, incident, near-miss, observation, safety walk) with an owner, due date, and closure evidence. This is the connective tissue across all HSEQ modules — see [ARCHITECTURE.md](./ARCHITECTURE.md) for the polymorphic "raised from" relationship and the validation rules that keep it safe.

### 6.6 Incident Reports
Formal record of an event that caused (or could have caused) harm, injury, or loss. Uses a **practical, configurable classification model**: a fixed catalogue of stable system categories (incident, near miss, unsafe act, unsafe condition, environmental event, property damage, first aid case, medical treatment case, lost-time injury) that companies can extend with their own additional categories, plus a fixed four-level severity scale (low / medium / high / critical). System categories cannot be renamed or removed by a tenant, so cross-tenant and platform-level reporting stays meaningful. See [DATABASE_SCHEMA.md — `event_categories`](./DATABASE_SCHEMA.md#event_categories--tenant--global-system-rows).

### 6.7 Near-Miss Reports
Record of an event that *almost* caused harm but didn't — structurally similar to incidents but lighter-weight, used for proactive trend analysis. Uses the same four-level severity scale as Incident Reports.

### 6.8 Safety Observations
Lightweight "see something, say something" record — positive or negative — that any worker can submit from the field. Negative observations may be tagged with an "unsafe act" or "unsafe condition" category from the same configurable catalogue used by Incident Reports.

### 6.9 Attachments & Photographs
Shared file-attachment capability used across HSEQ (and some operational) records — photo evidence for inspections, incidents, corrective action closure, etc.

### 6.10 Digital Signatures
v1 uses **authenticated electronic attestation**, not a certified/qualified e-signature product. Each signature captures: the signer's user ID, a snapshot of the signer's name at the time of signing, a timestamp, the statement/attestation text the signer accepted, the version of the document or form being attested to, and — where legally appropriate for the jurisdiction — the signer's IP address and user-agent. This is sufficient to formally attest to toolbox talk attendance, LMRA participation, inspection sign-off, and incident report submission for v1. Stronger legal e-signature guarantees (if a customer's jurisdiction or contract requires them) are a candidate for a later, optional integration with a dedicated e-signature provider — not something this module claims to provide.

### 6.11 Audit Logs
System-wide, append-only record of who did what to which record and when, across both operational and HSEQ modules. Not a feature end users configure — a cross-cutting requirement of every module. See [ARCHITECTURE.md](./ARCHITECTURE.md#8-audit-logging).

## 7. Certificate Expiry Notification Schedule

Default schedule (company-level configuration of these defaults is a future enhancement, not v1):

- 60 days before expiry
- 30 days before expiry
- 14 days before expiry
- 7 days before expiry
- On the expiry date
- Recurring while expired and unresolved (the document has not been renewed/replaced)

Recipients for every milestone:
- The employee the document belongs to (where they have platform login access).
- Their direct manager, where one is assigned (a future `employees.manager_id`-equivalent relationship — not part of the `employees` table implemented so far; see [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)).
- Anyone holding the HSEQ Manager role in the company.
- Anyone holding the Company Admin role in the company (the "designated administration recipient" for v1, now that the `payroll_admin` role has been retired with no direct replacement — see [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for the mapping rationale and [§10 open question 4](#10-open-product-questions)).

## 8. Cross-Cutting Requirements

- **Multi-tenant isolation**: no user can ever read or write another company's data, enforced at the database layer, not just the UI — regardless of how many companies that user belongs to.
- **Mobile-first**: every field-facing flow (LMRA, toolbox talk, timesheet entry, incident reporting) must be fully usable one-handed on a phone.
- **Auditability**: creation/modification of records is attributable to a user and timestamped; HSEQ records are never hard-deleted. Audit log entries and completed signature records are immutable — a correction is a new, linked record, never an edit to historical evidence.
- **Role-based access**: what a user can see and do is governed by the **union of the role(s)** they hold in their active company, enforced server-side, with a small set of explicit system-level restrictions (e.g., no one can edit an audit log or a completed signature) that always take precedence over any role grant.
- **Evidence-first HSEQ**: inspections, incidents, and corrective actions should be able to carry photo evidence and signatures, not just text.

## 9. Success Metrics (directional, to be refined with the business)

- % of scheduled crew with a completed daily LMRA before work starts.
- Median time from incident/near-miss report to assigned corrective action.
- % of corrective actions closed before due date.
- Timesheet discrepancy rate and median resolution time.
- % of employees with zero expired required certificates.

## 10. Open Product Questions

These do not block starting the technical foundation but should be resolved before the corresponding module is built — see the "Open Questions" section of [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

1. Beyond the internal category/severity model in [§6.6](#66-incident-reports), is a specific regulatory recordability/reporting format required (e.g., an OSHA-style recordability flag or a jurisdiction-specific export), and for which customer jurisdictions first?
2. Should Project Locations/Work Areas support an arbitrary-depth hierarchy, or is a fixed two-level (Project → Work Area) structure sufficient? (The schema already supports arbitrary depth; this is a UX/scope question, not a technical blocker.)
3. Who, operationally, has access to the Supabase project dashboard to configure the Custom Access Token Auth Hook that the multi-company active-selection mechanism depends on (see [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-company-membership-model))? This is a one-time setup task, but it is a real infrastructure dependency, not just application code.
4. Now that `payroll_admin` has been retired (Role Catalogue & Permissions milestone) with no direct replacement, is Company Admin alone the right default "designated administration recipient" for certificate-expiry notifications ([§7](#7-certificate-expiry-notification-schedule)) and for the Back Office persona ([§4](#4-personas)), or should a dedicated back-office/payroll role be reintroduced, or should a specific individual be configurable per company from day one? (See the Back Office row in [§4 Primary Personas](#4-primary-personas).)
5. Who is authorized to create company-specific custom incident/observation categories in [§6.6](#66-incident-reports) — Company Admin only, or also HSEQ Manager? (Default assumption in [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) is both; confirm before M14/M15.)

## 11. Future Identity, Employment History & Talent Pool Architecture (Documented, Not Implemented)

Agreed direction for how official company employment records, platform login identity, work positions, employment history, cross-company talent discovery, and platform administration relate to each other — captured now (Employee Management Polish milestone) so later work builds toward one coherent model instead of improvising it module by module. **Nothing in this section is implemented.** It exists purely to record the decision; see each subsection for exactly what is and isn't built today.

### 11.1 Official employee creation is company-controlled

A company (via `company_admin`/`operations_manager`) creates the official [`employees`](./DATABASE_SCHEMA.md#employees--tenant--implemented) record for a person working for it — employees do not self-register as an "official" employee of an company. The company controls the fields that constitute the official record: legal name, birth date, position, employment dates, and employment status. Only later, once the company chooses to, does it send an invitation; the invited person verifies their email and sets their own password to activate the linked login (account activation/invitations are explicitly not implemented yet — see [§8](#8-cross-cutting-requirements) exclusions and [IMPLEMENTATION_PLAN.md — M7.6](./IMPLEMENTATION_PLAN.md#m76--employee-management-foundation)). After activation, an employee may request a correction to their official data (e.g., a legal name change, a birth date typo) but never directly rewrites it themselves — a request is reviewed and applied by an authorized company role. The request/review flow itself is future work; the constraint being fixed now is *who owns the data*, not the review UI.

### 11.2 One global identity, many company-scoped employee records

- Exactly **one** `auth.users` login and **one** `profiles` row exists per real person/email — this is already true today (see [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-company-membership-model)) and does not change.
- That one identity may hold `company_memberships` in **more than one** company simultaneously (also already true).
- Each company maintains its **own**, entirely separate `employees` row for that person: its own `employee_number` (scoped to that company's prefix/counter — see [DATABASE_SCHEMA.md — `employees`](./DATABASE_SCHEMA.md#employees--tenant--implemented)), its own roles (via that company's `company_memberships`/`membership_roles`), and its own employment data (position, dates, status). Company A's copy of "Jane's employee record" and Company B's are unrelated records that happen to point at the same `profile_id`.
- **Implemented**: every `profiles` row carries a permanent, globally unique, publicly-safe `user_number` (format `USR-XXXXXXXX`) — see [DATABASE_SCHEMA.md — `profiles`](./DATABASE_SCHEMA.md#profiles--global-identity-only--implemented). This is the platform identity's own public identifier, entirely independent of every company-scoped `employee_number` a person accumulates across the companies they work for over their lifetime on the platform — it never changes, regardless of how many companies they join, leave, or rejoin. It is not yet surfaced in any UI (no Platform Super Admin area exists yet to display or search it), but the column, its generation, and its immutability are live.
- **Future requirement, not yet built**: when a second company invites someone whose email already has a `profiles` row (from a first company's invitation), the invitation flow must link the new `company_memberships` row to that **existing** identity (and its existing `user_number`) rather than creating a second `auth.users`/`profiles` row for the same email. Nothing in the codebase implements invitations yet, so this rule has no code to violate today — it's recorded here so the future invitation milestone is designed against it from the start rather than discovering the duplicate-identity problem after shipping. The invitation flow's "does this email already have a platform account" check will need a server-only Supabase Admin API lookup (`lib/supabase/admin.ts`, not built yet), since `profiles` has no email column and `auth.users` isn't directly queryable by the normal `authenticated` client.

### 11.3 Permission roles vs. work positions — two different kinds of data

See [ROLES_AND_PERMISSIONS.md §8](./ROLES_AND_PERMISSIONS.md#8-permission-roles-vs-work-positions-future) for the full statement of this distinction; summarized here for context: **permission roles** (`company_admin`, `project_manager`, `hseq_manager`, `inspector`, etc. — the existing `roles` table) control what a person may *do* in the application. **Work positions/trades** (scaffolder, welder, pipefitter, construction worker, cleaner, and so on) are separate business data describing what a person's job actually *is* on site — they are not permissions and do not belong in the `roles` table. `employees.position_title` (implemented, free text) is today's placeholder for this; [§11.5](#115-future-global-position-catalogue) below describes the future structured version. The existing production role catalogue is not renamed or extended in this milestone.

### 11.4 Employment history (implemented, narrower than originally envisioned)

**Implemented, Employment Lifecycle milestone**: `employee_employment_periods` — see [DATABASE_SCHEMA.md — Employment lifecycle](./DATABASE_SCHEMA.md#employment-lifecycle-employee_employment_periods). One row per continuous stretch of employment for an `employees` row within this company (start date, end date, end reason, an optional note, who ended it and when); an employee who leaves and is later rehired gets a new row, never a new `employees` row, so their employee number, roles history, and every other field on the record carry over unchanged. `employees.employment_status`/`start_date`/`end_date` are a database-enforced synced snapshot of this table, not an independent source of truth — see that section for exactly how.

This is a **narrower** slice than the event-timeline originally envisioned here: it covers hire → end → rehire cycles (what this milestone's requirements actually needed), not the fuller set of illustrative event kinds once sketched for this section (`position_changed`, `promoted`, `placed_on_leave`, `returned_from_leave`, and a product-facing rendered timeline UI). Those remain **not implemented** — a possible future widening of this same table (or a genuinely separate event log next to it), not a redesign of what's built. In particular:

- No UI renders periods as a prose timeline (`"15.01.2025 — Employed by Efecta UAB as Scaffolder"`) yet — the Employment tab on the employee profile lists periods as structured data (dates, reason, note), not narrative text.
- Promotions/position changes are not tracked as employment events — `employees.position_title` remains a plain, directly-editable field with no history of its own (see [§11.3](#113-permission-roles-vs-work-positions--two-different-kinds-of-data)).
- A leave-of-absence sub-state within an open period (`placed_on_leave`/`returned_from_leave`) is not implemented — `employment_status`'s `on_leave`/`inactive` enum values remain defined but unreachable through any code path today.
- The company's **full name at the time of the event**, captured into the row itself rather than looked up live (the same reasoning as `digital_signatures.signer_name_snapshot` — see [DATABASE_SCHEMA.md — `digital_signatures`](./DATABASE_SCHEMA.md#digital_signatures--tenant)), is **not** captured on `employee_employment_periods` — a real gap if an company ever renames itself, left for whichever future milestone widens this into a fuller history view.

### 11.5 Future global position catalogue

Not implemented. The future direction: a Platform-Super-Admin-managed **global** catalogue of standard positions/trades (mirroring how the `roles` catalogue is a fixed, platform-managed list today — see [DATABASE_SCHEMA.md — `roles`](./DATABASE_SCHEMA.md#roles--tenant--implemented)), from which company-authorized managers (not Platform Super Admin) assign a position to their own employees. Platform Super Admin's job is curating the *catalogue*, not assigning positions to individual employees one by one across every tenant — that assignment stays a company-level action, same as role assignment does today. A future "verified" badge on an assigned position must clearly state **who** assigned or verified it (an audit-style attribution, not an anonymous checkmark), so a viewer can tell "verified by Efecta UAB's HSEQ Manager" from an unverified self-reported value.

### 11.6 Future Recruiter role & Talent Pool (opt-in, cross-company)

Not implemented — explicitly excluded from this and the prior milestone. The future direction:

- `recruiter` is a **company-level** permission role (added to the future position/role work, not retrofitted into the existing catalogue now).
- A recruiter's visibility is scoped to their own company's employee records by default, the same as every other role — **archived employment records at another company are never visible to a recruiter automatically**, regardless of company. An company's `employees` rows (including archived ones) remain private to that company; there is no cross-tenant employee browsing anywhere in this platform's design.
- Cross-company discovery requires a **separate**, explicitly **opt-in** Talent Pool profile that an individual creates and controls themselves — distinct from any employer's `employees` record. Nothing about an employer creating, editing, or archiving someone's `employees` row ever creates or updates a Talent Pool profile as a side effect.
- Talent Pool visibility (whether a recruiter can find the profile at all) and contact permission (whether a recruiter may reach out) are **two separately controlled settings**, not one — an individual can be discoverable without being contactable, or vice versa, depending on what they've opted into.
- No schema, table, route, or UI for any of this exists yet, and none is planned for the current or immediately following milestone.
- **When a recruiter/Talent Pool list is eventually built**, it must reuse the same secure server-side list foundation the employee list uses today (`lib/pagination.ts`, `components/shared/pagination-bar.tsx`, `count_*`/`search_*`-style paired RPCs, RLS-scoped rows and counts) — server-side pagination with a capped page size (25/50/100), a total count computed without ever fetching rows the caller can't access, deterministic ordering with a tie-breaker, and URL-backed filter/page state — rather than a bespoke reimplementation. Reusing the pattern is a requirement precisely because a recruiter list is the one place in this platform where "don't accidentally expose more rows than the caller is entitled to" matters most.

### 11.7 Future Platform Super Admin dashboard

Not implemented — the `(platform)/` route group remains exactly what [ARCHITECTURE.md §4](./ARCHITECTURE.md#4-application-structure-module-based) already describes it as: prepared for, not built. The future direction, recorded here for scope clarity: a protected area, structurally separate from every tenant-facing `(app)/` route, covering company management, platform-wide user administration, the global position catalogue ([§11.5](#115-future-global-position-catalogue)), a future certificate catalogue, recruiter approval workflows ([§11.6](#116-future-recruiter-role--talent-pool-opt-in-cross-company)), privacy/data-subject requests, data retention controls, platform-level audit logs (distinct from a tenant's own `audit_events` view), and general system support/health monitoring. Platform Super Admin access is, and remains, structurally independent of any `company_memberships` row (see [ARCHITECTURE.md §3.1](./ARCHITECTURE.md#31-tenant-boundary)) — a company administrator can never grant, hold, or assign this role through any company-facing UI; it is a platform-operator-only allow-list (`platform_super_admins`, itself also not yet built — see [DATABASE_SCHEMA.md — `platform_super_admins`](./DATABASE_SCHEMA.md#platform_super_admins--global--not-implemented-this-milestone)).
