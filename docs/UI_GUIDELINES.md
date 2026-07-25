# UI Guidelines

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
| Unmodified/lightly modified shadcn primitives | `components/ui/` | `Button`, `Input`, `Dialog`, `Table` |
| Cross-module composed components | `components/shared/` | Page header with breadcrumbs, data table with built-in filter/sort, status badge, file upload dropzone |
| Domain-specific components | `modules/<domain>/components/` | Signature capture pad, scaffold tag selector, severity picker, checklist item row |

Domain-specific components that turn out to be reused across modules (e.g., the signature pad used by both LMRA and toolbox talks) get promoted to `components/shared/` — don't promote speculatively before a second real usage exists.

## 9. What Not to Do

- Don't introduce a second component library alongside shadcn/ui "just for this one thing."
- Don't hardcode role-based UI logic inline in a page component (`{roles.includes('hseq_manager') && ...}` scattered everywhere) — derive visibility from the same `permissions.ts` functions used for server-side authorization (see [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-authorization-model)), which take the user's full role array for their active organization, so UI and server enforcement never silently diverge.
- Don't build a desktop-first table view for a field-facing module and treat mobile as a follow-up pass.
- Don't invent a new color for "this specific status" without checking whether it collides with the safety-critical color meanings in [§3](#3-design-tokens).
