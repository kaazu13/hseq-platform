# UI Guidelines

## Implementation Status

**shadcn/ui is installed** (it was "not yet installed" in an earlier revision of this document — see [ARCHITECTURE.md §1](./ARCHITECTURE.md#1-technology-stack)), along with the professional application shell described in [§10](#10-application-shell--navigation) below: a collapsible sidebar, top bar, organization switcher, user menu, breadcrumbs, and a reusable component set. This is the database-foundation milestone's UI layer landing on top of it — see [IMPLEMENTATION_PLAN.md — M7.5](./IMPLEMENTATION_PLAN.md#m75--application-shell--design-system).

One correction to this document as originally written: the shadcn CLI generation this project ended up on (`components.json` → `"style": "base-nova"`) builds every primitive on **Base UI** (`@base-ui/react`), not Radix UI. Every mention of shadcn/ui elsewhere in this document (and in [ARCHITECTURE.md](./ARCHITECTURE.md)) still applies — "components are generated into `components/ui/` and owned directly," "don't hand-roll a primitive shadcn already provides" — only the underlying headless library changed. The practical difference that matters when writing new component usages: Base UI's composition prop is called `render` (accepting a `ReactElement`, e.g. `<Button render={<Link href="/x" />}>Text</Button>`), not Radix's `asChild`. See any existing `components/ui/*.tsx` file for the pattern in practice, or `node_modules/@base-ui/react/docs/react/utils/use-render.md` for the authoritative reference.

No manual light/dark toggle exists yet — dark mode follows `prefers-color-scheme` automatically (no `next-themes` `ThemeProvider`, no `.dark` class anywhere), a deliberate scope decision for this milestone; see [§3](#3-design-tokens).

## 1. Principles

1. **Mobile-first, not mobile-friendly.** Field roles (Employee, Supervisor, Inspector) will use this product on a phone, one-handed, sometimes with gloves on, often outdoors. Design the phone layout first; the desktop layout is progressive enhancement, not the default that gets squeezed down.
2. **Office roles get density; field roles get focus.** Company Admin/Ops/HSEQ Manager dashboards on desktop can be data-dense (tables, filters). Field-facing forms (LMRA, toolbox talk, timesheet entry, incident report) should show one task at a time with large touch targets — don't reuse a dense desktop table pattern on a field form.
3. **Never block on network optimism you can't guarantee.** Site connectivity is unreliable. Every field-facing mutation needs a clear pending/success/error state — a silent spinner that never resolves is a support ticket from a job site.
4. **Consistency over novelty.** Use shadcn/ui primitives as given; don't hand-roll a custom button/input/dialog when a primitive already covers the case. Custom components are for HSEQ/domain-specific needs (signature pad, checklist item, severity badge) that shadcn doesn't provide.

## 2. Stack Specifics

- **Tailwind CSS v4**, CSS-first configuration. Theme tokens live in `app/globals.css` under `@theme`/`@theme inline` — there is no `tailwind.config.js` to edit. New design tokens (colors, spacing, fonts) are added there, not in a JS config file.
- **shadcn/ui**: components are generated into `components/ui/` via the shadcn CLI and then owned/edited directly in the repo — they are not an opaque `node_modules` dependency. When a shadcn primitive needs a project-specific variant, edit the copied component rather than wrapping it, unless the customization is truly one-off.
- Current app shell (`app/layout.tsx`) already sets up Geist Sans/Mono fonts and a `min-h-full flex flex-col` body — new layouts should compose within that shell, not fight it.

## 3. Design Tokens

- Colors, spacing, and radii are defined once as CSS custom properties in `app/globals.css` (`@theme`) and consumed via Tailwind utility classes (`bg-background`, `text-foreground`, etc.) — never hard-coded hex values in components.
- **Dark mode**: the scaffold already switches `--background`/`--foreground` via `prefers-color-scheme: dark`. Every new token added to the theme must define both a light and dark value at the same time — a token that only works in light mode is an incomplete change.
- **Status/severity colors** (safety-critical, so treat deliberately, not as an afterthought):

  | Status | Suggested token intent |
  |---|---|
  | Scaffold tag: green / yellow / red | Map directly to conventional traffic-light semantics — do not remap these for brand consistency. Safety-tag color meaning is a site convention workers already know. |
  | LMRA result: go / no-go | Go = success/green family, No-go = destructive/red family, never ambiguous with a neutral gray. |
  | Incident/near-miss severity (low / medium / high / critical) | A single ordered sequential four-step scale so severity reads as a gradient of seriousness at a glance. This is a fixed system scale — it does not change when an organization adds custom incident categories (categories are a label, severity is always this same four-step scale regardless of category). |
  | Corrective action status/priority | Distinct from severity colors — don't reuse the exact same red for "critical priority" and "critical severity," they are different axes of meaning and appearing together (e.g., an incident's linked corrective action) would be confusing if visually identical. |

  Exact hex/OKLCH values are a visual-design decision to make when the design system is actually built (not prescribed here); the requirement is that the mapping above is respected and colors are never chosen ad hoc per screen.
- Do not rely on color alone for status — pair every status color with a text label or icon (accessibility requirement, also just useful in bright sunlight on a phone screen).
- **Incident/observation category badges** (system vs. organization-custom, per [DATABASE_SCHEMA.md — `event_categories`](./DATABASE_SCHEMA.md#event_categories--tenant--global-system-rows)) are a label, not a severity indicator — style them neutrally (e.g., a plain outline chip) so they never compete visually with the severity color from the row above. A custom category should look like a normal category in the UI, not visually flagged as "different," even though it's tenant-specific under the hood.

## 4. Layout Patterns

- **App shell**: persistent top bar (active-organization context, user menu, notifications) + role-aware navigation. On mobile, navigation collapses to a bottom tab bar or slide-out drawer — not a desktop sidebar squeezed into a phone width.
- **Organization switcher**: shown in the top bar's user/org menu only for users with more than one active membership (per [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model)) — for the common single-organization user it should be invisible, not a disabled or empty dropdown. Switching organizations is a deliberate, confirmed action (it changes what the user can see and do) — it should never be a single misplaced tap away from a frequently-used control, and should give clear feedback that a switch is in progress (it involves a session refresh, not an instant client-side change).
- **Field-facing forms** (LMRA, toolbox talk, incident/near-miss/observation, timesheet entry): single-column, one logical section visible at a time for long forms (e.g., a stepper for incident reporting: details → people involved → attachments → submit), large primary action button pinned to the bottom of the viewport.
- **Office-facing views** (project list, employee roster, corrective action tracker): responsive data table that collapses to stacked cards below a defined breakpoint — never a horizontally-scrolling table as the only mobile fallback for primary workflows.
- **Dashboards**: summary stat cards + a small number of focused charts/lists, scoped by the viewer's role per [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md) — don't build one dashboard that shows everything and hide rows client-side; the data fetched should already be scoped server-side.

## 5. Forms & Validation

- Every form has a shared `zod` schema in `lib/validation/` (or colocated with its module) used for **both** client-side field validation and server-side Server Function validation — one schema, not two definitions that can drift. See [API_CONVENTIONS.md](./API_CONVENTIONS.md#5-validation).
- Inline field-level errors, not just a top-of-form error summary — especially important on long field-facing forms where scrolling back to a summary is friction.
- Destructive/hard-to-reverse actions (closing an incident, deleting an employee document, suspending a user) require an explicit confirmation step (shadcn `AlertDialog`), not a single click.
- Forms that can be filled offline-adjacent (poor signal, not full offline support per [PRODUCT_REQUIREMENTS.md — Non-Goals](./PRODUCT_REQUIREMENTS.md#3-non-goals-initial-release)) should preserve in-progress input across an accidental navigation/reload where practical (e.g., a long incident report), rather than losing a field worker's typed content.

## 6. Feedback States

Every data-fetching view and every mutation needs an explicit design for each of:

| State | Requirement |
|---|---|
| Loading | Skeleton matching the eventual layout (not a generic centered spinner for list/table views) — use `loading.tsx` route conventions where the route boundary matches the loading region. |
| Empty | A real empty state with guidance ("No corrective actions assigned to you" + relevant next action), never a blank table with just headers. |
| Error | User-actionable message, not a raw error/stack trace. Distinguish "you did something invalid" (validation) from "something went wrong" (system error) in tone. |
| Success | Confirm the action happened — for field forms, a full-screen or prominent confirmation (not just a small toast that can be missed in sunlight) before returning to the next task. |

## 7. Accessibility

- Minimum WCAG AA contrast for all text and status indicators, checked against both light and dark theme values.
- Touch targets on field-facing UI: minimum 44×44px, generous spacing between adjacent actionable elements (gloved hands, outdoor use).
- All form inputs have associated labels (not placeholder-only labels); signature capture and photo attachment controls have accessible names for screen readers even though their primary use is visual/touch.
- Focus states are visible and consistent (shadcn defaults are a reasonable baseline — don't strip `focus-visible` styles for aesthetics).

## 8. Component Ownership

| Category | Where it lives | Example |
|---|---|---|
| Unmodified/lightly modified shadcn primitives | `components/ui/` | `Button`, `Input`, `Dialog`, `Table` — see [§10](#10-application-shell--navigation) for the full installed list |
| Cross-module composed components | `components/shared/` | `PageHeader`, `SectionHeader`, `StatCard`, `EmptyState`, `StatusIndicator`, `ConfirmDialog`, `ComingSoonPage` — all **implemented** |
| Application shell (persistent chrome, not page content) | `components/app-shell/` | `AppSidebar`, `TopBar`, `NavMain`, `OrgSwitcher`, `UserMenu`, `Breadcrumbs`, `nav-config.ts` — all **implemented**, see [§10](#10-application-shell--navigation) |
| Domain-specific components | `modules/<domain>/components/` | Signature capture pad, scaffold tag selector, severity picker, checklist item row — none exist yet, no business module has been built |

Domain-specific components that turn out to be reused across modules (e.g., the signature pad used by both LMRA and toolbox talks) get promoted to `components/shared/` — don't promote speculatively before a second real usage exists. `components/app-shell/` is a fourth category alongside the three above, specifically for the persistent chrome around every page (sidebar, top bar) — it isn't "cross-module" in the sense of being reused *inside* different pages' content the way `components/shared/` is; it's rendered once, by `app/(app)/layout.tsx`, and every page renders inside it.

## 9. What Not to Do

- Don't introduce a second component library alongside shadcn/ui "just for this one thing."
- Don't hardcode role-based UI logic inline in a page component (`{roles.includes('hseq_manager') && ...}` scattered everywhere) — derive visibility from the same `permissions.ts` functions used for server-side authorization (see [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-authorization-model)), which take the user's full role array for their active organization, so UI and server enforcement never silently diverge.
- Don't build a desktop-first table view for a field-facing module and treat mobile as a follow-up pass.
- Don't invent a new color for "this specific status" without checking whether it collides with the safety-critical color meanings in [§3](#3-design-tokens).

## 10. Application Shell & Navigation

**Implemented.** This is the desktop/tablet-oriented **management app shell** — Company Admin, Ops, HSEQ Manager, and similar office-facing roles. It is explicitly *not* the mobile-first employee portal described in [§11](#11-future-employee-portal-prepared-not-implemented); the two are architecturally separate surfaces, not one responsive layout trying to serve both.

### Structure

- **`app/(app)/layout.tsx`** — the route-group layout. Calls `requireUser()` (defense in depth, per [ARCHITECTURE.md §5](./ARCHITECTURE.md#5-authentication--session-handling)), resolves the user's organization memberships and "current organization" (see below), reads the `sidebar_state` cookie for the sidebar's initial collapsed/expanded state, and composes `SidebarProvider` → `AppSidebar` + `SidebarInset` (`TopBar` + page content).
- **`components/app-shell/app-sidebar.tsx`** — built on shadcn's `Sidebar` primitive (`components/ui/sidebar.tsx`), which already provides: desktop icon-collapse (`collapsible="icon"`), a Sheet-based mobile drawer (automatic below the `md` breakpoint), a `Cmd/Ctrl+B` keyboard shortcut, and cookie-persisted collapsed state. Composes:
  - **Header**: brand mark (link to `/dashboard`) + `OrgSwitcher`.
  - **Content**: `NavMain` — the grouped nav menu (Overview / Workforce / Projects / HSEQ / Records), driven entirely by `components/app-shell/nav-config.ts`.
  - **Footer**: `UserMenu` — avatar, name/email, Settings link, sign out (behind a confirmation prompt — see [§5](#5-forms--validation)).
- **`components/app-shell/top-bar.tsx`** — sidebar toggle, breadcrumb trail, global search and notifications (both **UI placeholders only** — visibly present, `disabled`, not wired to anything, per this milestone's explicit scope).
- **`components/app-shell/breadcrumbs.tsx`** — derives the trail from the current pathname against `nav-config.ts`, so individual pages don't pass breadcrumb props. Every route is one level deep today ("HSEQ Platform / Dashboard"); built to extend once a nested route (e.g. `/projects/[projectId]`) exists.
- **`components/app-shell/nav-config.ts`** — the single source of truth for "what modules exist, what routes they live at, what icon/description they use." The sidebar, the breadcrumb trail, and every placeholder page all read from this one list.

### Navigation structure (14 items)

| Group | Items |
|---|---|
| Overview | Dashboard *(real)* |
| Workforce | Employees, Timesheets |
| Projects | Projects, Equipment |
| HSEQ | LMRA, Toolbox Talks, Inspections, Incidents, Corrective Actions, Certificates |
| Records | Documents, Reports |
| *(sidebar footer, not a nav group)* | Settings |

Every item has a real route under `app/(app)/`. Thirteen of them render the shared `ComingSoonPage` component (`components/shared/coming-soon.tsx`) instead of a business module — satisfies "routes must not produce broken links" without pretending a module exists before it does. **`Equipment` and `Documents` are new nav placeholders introduced by this milestone** — they weren't part of the original core module list in [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md); reconcile that document (or drop the nav items) once their scope is actually defined.

### Organization context (real data, not a placeholder)

Unlike the module placeholders above, organization/membership data is real and live — the schema exists (see [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)) and this milestone queries it directly:

- **`OrgSwitcher`** (`components/app-shell/org-switcher.tsx`): renders nothing for zero memberships, plain static text for exactly one (per the "invisible for the common case" rule in [§4](#4-layout-patterns)), a full dropdown for two or more. Selecting an organization calls the `setActiveOrganization` Server Function (`modules/organizations/actions.ts`), which re-verifies membership server-side before writing `profiles.active_organization_id` — that column is a UX preference only, never a security boundary, per [ARCHITECTURE.md §3.2](./ARCHITECTURE.md#32-organization-membership-model).
- **Zero-membership state**: handled once, in `app/(app)/dashboard/page.tsx`, as a distinct branch (not a degraded version of the normal dashboard) — a polished `EmptyState` explaining that organizations are set up manually for v1. The sidebar/org-switcher deliberately show nothing extra in this case rather than an empty or disabled dropdown.
- **Dashboard KPIs**: exactly one (team member count) is a real query (`countActiveMembers`); every other stat card uses `StatCard`'s `"placeholder"` variant — an em dash and a "Not yet available" badge, never a fabricated or misleading zero. See `components/shared/stat-card.tsx`'s own header comment for why a true `0` would be misleading here (a claim about your data vs. a claim about the software).

### Installed component inventory

shadcn/ui primitives (`components/ui/`, Base UI-based — see [Implementation Status](#implementation-status)): `avatar`, `alert`, `alert-dialog`, `badge`, `breadcrumb`, `button`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `pagination`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `sonner` (toasts), `tabs`, `table`, `textarea`, `tooltip`.

`table`/`pagination`/`tabs`/`select`/`checkbox`/`textarea`/`dialog` are installed and ready but have **no live usage yet** — no business module has real tabular/paginated/tabbed data to show. That's expected, not a gap: they're foundation for the modules in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) M8 onward, not something this UI-only milestone should force a fake usage of.

## 11. Future Employee Portal (Prepared, Not Implemented)

The management app shell in [§10](#10-application-shell--navigation) is deliberately **not** what field employees will use day-to-day — it's a desktop/tablet-density office tool, the opposite of [§1](#1-principles)'s "mobile-first, not mobile-friendly" principle for field roles. A separate portal is planned for: viewing worked hours, viewing assignments, submitting LMRA, viewing certificates, signing toolbox talks, and receiving notifications — all Employee-role, phone-first interactions. **None of this is implemented in this milestone** — this section documents the intended architecture so the eventual work has a landing spot, per this milestone's explicit "prepare, don't build" scope.

Planned shape:
- **A separate route group**, e.g. `app/(portal)/`, sibling to `app/(app)/` and `app/(marketing)/` — not a responsive variant of the management shell, a genuinely different layout (`app/(portal)/layout.tsx`) with its own shell: a bottom tab bar (not a sidebar — see [§4](#4-layout-patterns)'s "mobile: navigation collapses to a bottom tab bar or slide-out drawer, not a desktop sidebar squeezed into a phone width"), large touch targets, single-column task-focused screens.
- **Shared foundation, separate presentation**: both portals reuse the same auth (`lib/auth/session.ts`), the same Server Functions/queries where the underlying data is the same (e.g. a timesheet is a timesheet), and the same design tokens (`app/globals.css`) — but the *component trees* are separate. `components/app-shell/*` is management-shell-specific; a future `components/employee-shell/*` (or similar) would hold the portal's own chrome, not a variant of `AppSidebar`.
- **Role-gated entry, not URL-guessing**: which portal a signed-in user lands in is a product decision to make when this is actually built (a role check, a separate subdomain, an explicit choice) — not decided here, since it depends on whether a single person is ever both an office-role and field-role user of the same organization (see the open questions in [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md)).
- **Field-facing form patterns** (stepper flows, large pinned primary actions, offline-adjacent input preservation) described in [§4](#4-layout-patterns) and [§5](#5-forms--validation) apply to this portal specifically — the management shell built in this milestone has no forms of consequence yet (no business modules), so those patterns haven't been exercised anywhere yet either.

Nothing under `app/(portal)/` exists yet — no folder, no route, no component. This section is the extent of "preparation" for this milestone.
