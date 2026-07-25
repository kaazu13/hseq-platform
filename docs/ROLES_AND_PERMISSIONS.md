# Roles and Permissions

## 1. Role Definitions

| Role | Scope | Summary |
|---|---|---|
| **Platform Super Admin** (PSA) | Platform-wide, cross-tenant | Vendor operator. Onboards/suspends organizations, monitors platform health. Does **not** casually browse tenant business data, and holds this access **independently of any `organization_memberships` row** — see [ARCHITECTURE.md §3.1](./ARCHITECTURE.md#31-tenant-boundary). |
| **Company Admin** (CA) | Organization-wide | Owns the tenant. Manages memberships/roles, org settings, and has full visibility across all projects and modules within their org. |
| **Operations Manager** (OM) | Organization-wide | Oversees projects, scheduling, and workforce operations across the org. Not HSEQ-focused, but views HSEQ status for oversight. |
| **HSEQ Manager** (HM) | Organization-wide | Owns all HSEQ modules org-wide: inspections, incidents, corrective actions, compliance reporting, and the org's custom incident/observation categories. |
| **Project Manager** (PM) | Assigned project(s) | Manages a specific project: schedule, budget-adjacent data, and HSEQ status *for that project*. |
| **Supervisor** (SV) | Assigned project(s)/crew | Day-to-day site lead. Runs toolbox talks/LMRA, approves crew hours, logs observations. |
| **Inspector** (IN) | Assigned project(s) | Conducts formal inspections (scaffold, safety walks) and raises corrective actions. |
| **Planner** (PL) | Organization-wide or assigned project(s) | Builds and maintains the daily workforce schedule. |
| **Payroll / Administration** (PA) | Organization-wide | Back-office: reconciles timesheets, manages employee documents, exports payroll-relevant data (CSV/Excel-friendly). Not HSEQ-facing, but is a default recipient for certificate-expiry notifications alongside Company Admin — see [PRODUCT_REQUIREMENTS.md §7](./PRODUCT_REQUIREMENTS.md#7-certificate-expiry-notification-schedule). |
| **Employee** (EM) | Self only | Field worker. Views own schedule/documents, submits own timesheet, completes assigned HSEQ forms (LMRA, toolbox talk attendance, observations), signs off. |

## 2. Multi-Organization, Multi-Role Model

**A user may belong to more than one organization, and may hold more than one role within the same organization.** This replaces an earlier single-org/single-role assumption. Concretely:

- Membership in an organization (`organization_memberships`) is separate from role assignment (`membership_roles`) — see [DATABASE_SCHEMA.md §3](./DATABASE_SCHEMA.md#3-core-tables). A membership can carry several roles at once (e.g., a person who is both Supervisor and Inspector), and a person can hold entirely different roles in a second organization they also belong to.
- At any moment, a user operates within one **active organization** (see [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model)); everything in this matrix is evaluated against the role(s) they hold in that active organization only. Roles held in a different organization they also belong to are irrelevant until they switch.
- **Permissions are the union of the active membership's assigned roles.** If *any* held role grants a capability for a module, the user has it — holding an additional, narrower role never takes something away that a broader role already grants.
- **Explicit restrictions take precedence over the union.** A short list of system-level rules is a hard deny regardless of how many or which roles a user holds:
  - No one can read or write another organization's data, no matter their role in their own organization.
  - No one can update or delete an `audit_logs` row or a completed `digital_signatures` row (see [DATABASE_SCHEMA.md §6](./DATABASE_SCHEMA.md#6-hseq-tables-continued) / [§8](./ARCHITECTURE.md#8-audit-logging)) — this is not a role grant, it is the absence of any policy that would allow it.
  - A handful of narrower, module-specific carve-outs noted in the footnotes below (e.g., a Supervisor's corrective-action management still requires HSEQ Manager sign-off on certain closures) — these are deliberate exceptions to an otherwise-permissive role grant, not general rules.
  These checks run *before*, and can override, the ordinary role-union evaluation. See [§6](#6-notes-on-enforcement).
- "Assigned project(s)" scope (PM, SV, IN, PL) means the role only grants access to projects the user is explicitly linked to (via `schedule_entries`, a project assignment, or being `project_manager_id`) — this project-level scoping is layered on top of the org-level RLS boundary and enforced in the module's `permissions.ts` + supporting RLS policy, not by role alone, and is independent of the multi-role union described above (a user's project assignment doesn't change just because they hold an extra role).

## 3. Permission Legend

| Symbol | Meaning |
|---|---|
| **F** | Full — create, view, edit, delete/close, and approve within their scope |
| **M** | Manage — create, view, edit, and approve within their scope, but not delete |
| **C** | Contribute — create and edit their own entries; view scope-wide |
| **O** | Own only — create/view/edit only records they are the subject of or author of |
| **V** | View only |
| **—** | No access |

"Scope" = organization-wide for org-scoped roles (CA, OM, HM, PA), or the specific project(s)/crew the user is assigned to for project-scoped roles (PM, SV, IN, PL). Platform Super Admin scope is explained in row notes, not the legend, since it is structurally different (cross-tenant, not org-internal). **A column represents "this role, if held"** — a user holding multiple roles reads the matrix as one row per held role and takes the highest-privilege symbol across them for each module (F > M > C > O/V > —), subject to the explicit-restriction overrides in [§2](#2-multi-organization-multi-role-model).

## 4. Core Operations Modules

| Module | PSA | CA | OM | HM | PM | SV | IN | PL | PA | EM |
|---|---|---|---|---|---|---|---|---|---|---|
| Organizations (own org settings) | V¹ | F¹² | V | V | — | — | — | — | V | — |
| Organization Memberships & Roles | F¹³ | F | V | — | — | — | — | — | V | O |
| Employee Profiles | — | F | M | V | V | V | — | V | M | O |
| Projects | — | F | F | V | M⁴ | V⁴ | V⁴ | V | V | V⁴ |
| Project Locations / Work Areas | — | F | F | V | M⁴ | C⁴ | V⁴ | V | — | V⁴ |
| Daily Workforce Scheduling | — | F | F | V | M⁴ | C⁴ | — | F | V | O |
| Worked Hours / Timesheets | — | F | M | — | M⁴ | M⁴ | — | V | F | O⁵ |
| Hour Discrepancy Requests | — | F | M | — | M⁴ | M⁴ | — | V | F | C⁵ |
| Payroll Export (CSV / XLSX) | — | V | V | — | — | — | — | — | F | — |
| Employee Documents & Certificates | — | F | V | V | V | V | — | — | F | O⁶ |
| Notifications | — | O | O | O | O | O | O | O | O | O |
| Reports & Dashboards | V¹ | F | F | F | V⁴ | V⁴ | V⁴ | V | M⁷ | — |

¹ PSA sees platform-level health/usage metrics only, not tenant business data, per [ARCHITECTURE.md §3.1](./ARCHITECTURE.md#31-tenant-boundary).
² Company Admin's "Full" on org settings covers ordinary configuration (name, settings columns); changing an organization's `status` or offboarding it (`deleted_at`) is PSA-only regardless — see [DATABASE_SCHEMA.md — `organizations`](./DATABASE_SCHEMA.md#organizations--global-tenant-root).
³ Platform Super Admin's access to Organization Memberships & Roles is specifically for provisioning an organization's **first** Company Admin at onboarding (v1 organizations are created manually by PSA, per [PRODUCT_REQUIREMENTS.md §3](./PRODUCT_REQUIREMENTS.md#3-non-goals-initial-release)) — it does not extend to ongoing membership management of an org's other users, which is Company Admin's job day-to-day.
⁴ Limited to the project(s) the PM/SV/IN/PL/EM is assigned to.
⁵ Employee: full CRUD on their own draft timesheet before submission; read-only once submitted/approved; can create (but not approve) a discrepancy request against their own timesheet.
⁶ Employee: view/upload their own documents; cannot verify/approve them.
⁷ Payroll/Administration reports are limited to timesheet/hours/document-compliance exports, not HSEQ dashboards.

## 5. HSEQ Modules

| Module | PSA | CA | OM | HM | PM | SV | IN | PL | PA | EM |
|---|---|---|---|---|---|---|---|---|---|---|
| Incident/Observation Categories (custom) | — | M⁸ | V | M⁸ | V | V | V | — | — | V |
| LMRA | — | V | V | F | V⁴ | M⁴ | V⁴ | — | — | C⁴ ⁹ |
| Toolbox Talks | — | V | V | F | V⁴ | M⁴ | V⁴ | — | — | C⁴ ⁹ |
| Scaffold Inspections | — | V | V | F | V⁴ | V⁴ | M⁴ | — | — | V⁴ |
| Safety Walks | — | V | V | F | V⁴ | C⁴ | M⁴ | — | — | — |
| Corrective Actions | — | V | V | F | M⁴ | M⁴ ¹⁰ | M⁴ ¹⁰ | — | — | O ¹¹ |
| Incident Reports | — | F | V | F | M⁴ | C⁴ | C⁴ | — | — | C ¹² |
| Near-Miss Reports | — | V | V | F | V⁴ | C⁴ | C⁴ | — | — | C ¹² |
| Safety Observations | — | V | V | M | V⁴ | C⁴ | C⁴ | — | — | C ¹² |
| Attachments & Photographs | — | V | V | F | C⁴ | C⁴ | C⁴ | — | — | C ¹² |
| Digital Signatures | — | V | V | V | V⁴ | O ¹³ | O ¹³ | — | — | O ¹³ |
| Audit Logs | V¹⁴ | V | — | V | — | — | — | — | — | — |

⁸ Company Admin and HSEQ Manager can create/deactivate their organization's **custom** categories; the nine **system** categories (see [DATABASE_SCHEMA.md — `event_categories`](./DATABASE_SCHEMA.md#event_categories--tenant--global-system-rows)) are immutable seed data that no role — including these two — can write to.
⁹ Employee participates in and signs LMRA/toolbox talks they attend; cannot create/schedule them.
¹⁰ Supervisor and Inspector can create/manage corrective actions raised from their own findings, and update status on items assigned to them; cannot close out actions assigned to others without HSEQ Manager sign-off (module-level rule in `modules/hseq/corrective-actions/permissions.ts`, not just role) — this is one of the explicit restrictions from [§2](#2-multi-organization-multi-role-model) that overrides the plain role grant.
¹¹ Employee can only update/comment on a corrective action *assigned to them* (e.g., mark evidence submitted); cannot change due date/priority or close it.
¹² Any authenticated Employee can submit an incident, near-miss, or observation report and attach evidence — this is intentionally broad (safety reporting should never be gated behind a manager role) and views are limited to reports they authored.
¹³ A signature is only ever created by the signer, for their own attestation; it is never editable by anyone, including the signer, once written (see [DATABASE_SCHEMA.md — `digital_signatures`](./DATABASE_SCHEMA.md#digital_signatures--tenant)) — another explicit restriction that overrides any role's "Full" grant elsewhere.
¹⁴ PSA can view platform-level audit entries (e.g., org suspension events); tenant-internal audit logs remain scoped to that org's CA/HM per the tenant isolation rule.

## 6. Notes on Enforcement

- This matrix is the source of truth for two things that must stay in sync: (a) RLS policies in the database, and (b) the `permissions.ts` authorization functions per module referenced in [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-authorization-model). When this matrix changes, both must be updated in the same change set.
- Permission evaluation is: **union of the active membership's roles' grants for this module, then apply any explicit restriction that overrides it.** Implementation-wise, `permissions.ts` functions take the caller's full role array (not a single role) and the explicit-restriction checks run first and can short-circuit to a deny regardless of what the role union would otherwise allow.
- "Full" for a manager role (e.g., HSEQ Manager on incident reports) still respects [soft-deletion rules](./DATABASE_SCHEMA.md#7-deletion-behavior-summary) — "delete" means soft delete, and is always audit-logged.
- Company Admin's broad visibility (V/F across nearly everything) is intentional: they are accountable for the whole tenant, including HSEQ outcomes, even though HSEQ Manager owns day-to-day HSEQ operation.
- Project-scoped roles (PM, SV, IN, PL) never gain implicit access to a project they are not assigned to, even within their own organization — this is enforced the same way tenant isolation is (a server-side/RLS check), not left to the UI to hide unassigned projects.
- Where a cell looks inconsistent with intuition (e.g., Planner has no HSEQ access at all), that is deliberate: Planner's responsibility is strictly workforce scheduling, and least-privilege is preferred over granting broad read access "just in case." A Planner who is *also* a Supervisor (multi-role) gets Supervisor's HSEQ access through the union — the Planner role itself still grants none.

## 7. Open Questions Affecting This Matrix

- Whether HSEQ Manager should be the *sole* role permitted to create organization-specific custom incident/observation categories, or whether Company Admin should also retain it as currently modeled (footnote 8) — see [PRODUCT_REQUIREMENTS.md §10](./PRODUCT_REQUIREMENTS.md#10-open-product-questions).
- Whether Payroll/Administration needs any read access to incident reports for workers'-compensation-adjacent reporting — currently scoped to zero HSEQ access pending a concrete requirement.
