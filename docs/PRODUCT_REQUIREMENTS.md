# Product Requirements Document

## 1. Product Summary

A multi-tenant SaaS platform for construction and industrial contractors that unifies **workforce operations** (scheduling, timesheets, employee records) with **HSEQ management** (Health, Safety, Environment, Quality — inspections, incidents, corrective actions, digital sign-off).

Each customer ("Company" or "Organization") operates in a fully isolated tenant. A single person may belong to and work across **more than one Organization** (e.g., a subcontractor engaged by two client companies) — but within each Organization they see only that Organization's data, selected one at a time as their active organization. Organizations remain fully isolated tenants from one another regardless of shared membership.

## 2. Goals

- Replace paper/Excel-based site safety processes with structured, auditable digital forms.
- Give operations managers a single place to see who is scheduled, who showed up, and what they worked on.
- Give HSEQ managers real-time visibility into inspections, incidents, and open corrective actions across all active projects.
- Provide a defensible audit trail (who did what, when) for regulatory and insurance purposes.
- Work reliably from a phone on a job site (poor connectivity, gloves, sunlight-readable UI), not just from an office desktop.

## 3. Non-Goals (initial release)

- Payroll processing / payment disbursement, and **direct integration with any payroll provider**. v1 is **export-only**: the platform produces CSV and Excel-friendly (XLSX) exports of worked hours for a human or a downstream system to consume. Provider-specific integrations (e.g., ADP, Gusto, Xero) are a possible later module, not v1 scope.
- **Public self-service organization registration.** In v1, Organizations are created manually by a Platform Super Admin only — see [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model) and [IMPLEMENTATION_PLAN.md — M4](./IMPLEMENTATION_PLAN.md#m4--organization-onboarding--user-management). There is no "sign up your company" flow to design or build yet.
- **Qualified or advanced legal e-signature compliance** (e.g., eIDAS Advanced/Qualified Electronic Signature, an ESIGN-Act-certified provider integration). v1 digital signatures are authenticated electronic attestations, not a certified e-signature product — see [§6.10](#610-digital-signatures) and [ARCHITECTURE.md §10](./ARCHITECTURE.md#10-file-storage-attachments-photos-signatures). A dedicated e-signature provider integration is a possible later, optional module.
- Native mobile apps (initial release is a responsive web app; a native/PWA wrapper is a future consideration).
- Offline-first data entry with conflict resolution (initial release assumes intermittent connectivity is tolerated by the UI, not a full offline queue/sync engine).
- Public API for third-party integrations (internal API only in initial release).
- Multi-language i18n (English only in initial release; copy should avoid hard-coding assumptions that block future translation).

## 4. Primary Personas

| Persona | Represents role(s) | Core needs |
|---|---|---|
| Platform Owner | Platform Super Admin | Onboard/suspend companies, monitor system health, never touches tenant business data directly |
| Company Admin | Company Admin | Configure the org, manage users/roles, billing-adjacent settings, full visibility into their org |
| Ops Lead | Operations Manager, Project Manager, Planner | Schedule crews, manage projects/locations, resolve timesheet discrepancies |
| Safety Lead | HSEQ Manager, Inspector | Run inspections/audits, manage incidents and corrective actions, own compliance reporting |
| Site Lead | Supervisor | Run daily toolbox talks/LMRA with the crew, log observations, approve crew hours |
| Field Worker | Employee | Clock hours, complete assigned safety forms, view own schedule/documents, sign forms |
| Back Office | Payroll / Administration | Reconcile worked hours, manage employee documents/certificates, export timesheet data |

A real person may map to more than one persona at once within the same organization (e.g., someone who is both a Supervisor and a certified Inspector), and may hold different personas in different organizations if they belong to more than one. See [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md) for the full role list, the multi-role model, and the permission matrix.

## 5. Core Modules (Operations)

### 5.1 Organizations / Companies
Tenant root entity. Holds org profile, settings, and subscription/plan status. Every tenant-owned record traces back to exactly one organization. **Created only by a Platform Super Admin in v1** — no self-service registration.

### 5.2 User Accounts & Organization Membership
A user's authentication identity (Supabase Auth user + a `profiles` record holding identity info only — name, phone) is separate from their relationship to any given organization. A person's membership in an organization — their status there (invited/active/suspended/removed) and the role(s) they hold there — is tracked independently, and a person may hold memberships (with different roles) in **more than one organization**. When a user belongs to more than one organization, they select one as their **active organization**; everything they see and do is scoped to that selection until they switch. See [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model) for the structure and how active-organization selection works.

### 5.3 Employee Profiles
HR-facing record for a person working for the org: job title, trade/discipline, employment type, start/end date, direct supervisor (where assigned), emergency contact, linked user account (optional — a worker may exist as an employee record before they have platform login access).

### 5.4 Projects
A contracted job/site the company is executing. Has a status lifecycle (planned → active → on hold → closed), client reference, address, and date range.

### 5.5 Project Locations & Work Areas
Hierarchical breakdown of a project site (e.g., Project → Zone → Work Area) used to scope schedules, inspections, and incidents to a physical location, and to support location-specific risk data (e.g., a scaffold's work area).

### 5.6 Daily Workforce Scheduling
Assigns employees to a project/work area for a given date and shift. Supervisors build the day's crew list; employees see their assignment.

### 5.7 Worked Hours & Timesheets
Actual clocked/reported hours per employee per day, linked to the schedule entry where applicable. Supports supervisor approval workflow before hours are considered final.

### 5.8 Hour Discrepancy Requests
Structured way for an employee or supervisor to flag a mismatch between scheduled and worked hours (or a missed clock event) and route it for review/approval, producing an auditable resolution instead of an off-system conversation.

### 5.9 Employee Documents & Certificates
Stores required documents (ID, right-to-work, training certificates, medical clearance) with expiry tracking so HSEQ/Ops can see who is out of compliance before it becomes a site issue. Expiry produces staged notifications (60/30/14/7 days before expiry, on the expiry date, and recurring while expired and unresolved) to the employee, their direct supervisor where assigned, the HSEQ Manager, and Company Admin/Administration — see [§7 below](#7-certificate-expiry-notification-schedule).

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
Formal record of an event that caused (or could have caused) harm, injury, or loss. Uses a **practical, configurable classification model**: a fixed catalogue of stable system categories (incident, near miss, unsafe act, unsafe condition, environmental event, property damage, first aid case, medical treatment case, lost-time injury) that organizations can extend with their own additional categories, plus a fixed four-level severity scale (low / medium / high / critical). System categories cannot be renamed or removed by a tenant, so cross-tenant and platform-level reporting stays meaningful. See [DATABASE_SCHEMA.md — `event_categories`](./DATABASE_SCHEMA.md#event_categories--tenant--global-system-rows).

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

Default schedule (organization-level configuration of these defaults is a future enhancement, not v1):

- 60 days before expiry
- 30 days before expiry
- 14 days before expiry
- 7 days before expiry
- On the expiry date
- Recurring while expired and unresolved (the document has not been renewed/replaced)

Recipients for every milestone:
- The employee the document belongs to (where they have platform login access).
- Their direct supervisor, where one is assigned (see `employee_profiles.supervisor_id` in [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)).
- Anyone holding the HSEQ Manager role in the organization.
- Anyone holding the Company Admin or Payroll/Administration role in the organization (the "designated administration recipient" for v1 — see [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for the mapping rationale).

## 8. Cross-Cutting Requirements

- **Multi-tenant isolation**: no user can ever read or write another organization's data, enforced at the database layer, not just the UI — regardless of how many organizations that user belongs to.
- **Mobile-first**: every field-facing flow (LMRA, toolbox talk, timesheet entry, incident reporting) must be fully usable one-handed on a phone.
- **Auditability**: creation/modification of records is attributable to a user and timestamped; HSEQ records are never hard-deleted. Audit log entries and completed signature records are immutable — a correction is a new, linked record, never an edit to historical evidence.
- **Role-based access**: what a user can see and do is governed by the **union of the role(s)** they hold in their active organization, enforced server-side, with a small set of explicit system-level restrictions (e.g., no one can edit an audit log or a completed signature) that always take precedence over any role grant.
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
3. Who, operationally, has access to the Supabase project dashboard to configure the Custom Access Token Auth Hook that the multi-organization active-selection mechanism depends on (see [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model))? This is a one-time setup task, but it is a real infrastructure dependency, not just application code.
4. Is Company Admin + Payroll/Administration the right default recipient set for "designated administration recipient" on certificate-expiry notifications ([§7](#7-certificate-expiry-notification-schedule)), or should a specific individual be configurable per organization from day one?
5. Who is authorized to create organization-specific custom incident/observation categories in [§6.6](#66-incident-reports) — Company Admin only, or also HSEQ Manager? (Default assumption in [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) is both; confirm before M14/M15.)
