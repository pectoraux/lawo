# Task 8 — Frontend Builder (Nomos Experience Plane)

## Task
Build the consumer-facing UI for the Nomos platform at `/home/z/my-project/src/app/page.tsx` (the only user-visible route — `/`). A single-page interactive dashboard that demonstrates the ENTIRE platform: jurisdiction graph, rule engine, state engine, provenance, truth model, packages, procedures, audit trail, and architecture invariants.

## Files produced

- `/home/z/my-project/src/lib/nomos-api.ts` — typed API client (9 functions: getOrient, postState, postEvaluate, postContext, getPackages, getJurisdictions, getAudit, getDecisions, saveDecision, getDemoPresets). All use relative URLs only (gateway rule). Exports response interfaces that mirror the kernel primitives.
- `/home/z/my-project/src/lib/nomos-store.ts` — Zustand + immer middleware client store. Holds orient, presets, situationId, jurisdictionIds[], asOf, subjectId, facts[], decision {state, provenance, audit}, auditTrail[], loading/evaluating flags. Actions: init(), applyPreset(), evaluate() (calls postState), refreshAudit(), updateFact/addFact/removeFact, setSubjectId, setAsOf, toggleJurisdiction.
- `/home/z/my-project/src/components/nomos/TruthBadge.tsx` — reusable T0–T5 badge using TRUTH_BADGE tokens; supports sm/md/lg sizes with optional description.
- `/home/z/my-project/src/components/nomos/EffectBadge.tsx` — RuleEffect badge colored by EffectKind (RIGHT=emerald, PERMISSION=teal, OBLIGATION=amber, RESTRICTION=rose, FEE=zinc, OPTION=violet, CONSEQUENCE=orange). Shows kind, code, label, amount, detail.
- `/home/z/my-project/src/components/nomos/SituationStateMachine.tsx` — 6-state horizontal flow visualization with Framer Motion pulse on the active state. Falls back to the canonical APPROACH → ORIGIN_EXIT → TRANSITION → DESTINATION_ENTRY → CUSTOMS → COMPLETION flow.
- `/home/z/my-project/src/components/nomos/ProvenanceTree.tsx` — tree visualization of DECISION → RULE → SOURCE → AUTHORITY → FACTS → EVIDENCE → CALCULATION → ASSUMPTIONS, with monospace IDs and inline TruthBadge on each rule and fact. Uses ScrollArea with max-h-96 and nested border-l-2 layout.
- `/home/z/my-project/src/components/nomos/ContextBuilder.tsx` — left column. Subject ID input, situation selector (read-only badge when single, Select when multiple), jurisdiction checkbox list (with kind badges colored by JurisdictionKind), as-of date input, fact editor supporting string/number/boolean value types (Switch for bools, number input for numerics), JSON preview, large emerald Evaluate button with spinner.
- `/home/z/my-project/src/components/nomos/DecisionResult.tsx` — center column. Empty placeholder, then: state snapshot card with truth badge + subjectId + situationId + asOf + jurisdictions chips + 3-card summary (applicable rules, fired effects, provenance entries); SituationStateMachine strip; effects bucket cards (Rights/Permissions/Obligations/Restrictions/Fees/Options) — clicking expands inline; obligations/rights/permissions/restrictions bucketed list; options/actions section; ProvenanceTree.
- `/home/z/my-project/src/components/nomos/PackageRegistry.tsx` — accordion of all 7 packages with manifest, counts, dependencies, supported jurisdictions, rules (with TruthBadge), actions, verification metadata.
- `/home/z/my-project/src/components/nomos/JurisdictionGraphPanel.tsx` — indented-tree forest visualization of the jurisdiction graph (supranational roots → countries → regions → municipalities), nodes colored by kind, edge relations shown inline. Supports the 11 relation types.
- `/home/z/my-project/src/components/nomos/TruthModelReference.tsx` — 2-column grid of T0–T5 reference cards.
- `/home/z/my-project/src/components/nomos/AuditTrail.tsx` — recent audit events list with severity badges; auto-refreshes every 30s; manual refresh button.
- `/home/z/my-project/src/components/nomos/InvariantsReference.tsx` — 3-column accordion of all 18 invariants (I1–I18) with code, statement, detail, and category badge.
- `/home/z/my-project/src/components/nomos/PlanesOverview.tsx` — 5-card row of the architecture planes (Experience / Intelligence / Knowledge / Execution / Foundation).
- `/home/z/my-project/src/components/nomos/ThemeToggle.tsx` — light/dark toggle using next-themes (canonical mounted-flag pattern to avoid hydration mismatch).
- `/home/z/my-project/src/app/page.tsx` — main client component. Sticky header (NOMOS wordmark, truth-level legend, Kernel:Frozen badge, theme toggle), hero with 4 demo preset buttons (auto-loads facts+jurisdictions+situation and evaluates), 3-column workspace grid (ContextBuilder / DecisionResult / right column with PackageRegistry+JurisdictionGraphPanel+TruthModelReference+AuditTrail), then InvariantsReference + PlanesOverview, then sticky footer.
- `/home/z/my-project/src/app/layout.tsx` — wrapped children in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>` from next-themes; added Sonner Toaster (already had shadcn/ui Toaster); updated metadata to "Nomos"; kept `suppressHydrationWarning` on html.

## Key UI decisions
- Color palette: emerald (T0/T1, RIGHT, authoritative), amber (T2/T3, OBLIGATION), zinc (T4, FEE, community), rose (T5, RESTRICTION, prohibited), teal (accent, PERMISSION), violet (OPTION). NO indigo or blue anywhere.
- Layout: `min-h-screen flex flex-col` root with `mt-auto` footer — sticky footer per spec.
- 3-column responsive grid: `grid-cols-1 lg:grid-cols-12` with col-span-4 (ContextBuilder), col-span-5 (DecisionResult), col-span-3 (right column).
- All async operations wrapped in try/catch with sonner toast on error; loading skeletons from shadcn/ui used during initial fetch.
- Fact editor auto-detects value type (boolean → Switch, number → numeric Input, string → text Input); editing the value preserves type.
- Apply preset: sets situationId, jurisdictionIds, asOf, facts (with subjectId cascaded), then fires evaluate() — the demo is one click.
- Jurisdiction multi-select: simple checkbox list (one per jurisdiction) — chosen over Command for visibility. Each shows code + name + kind badge.
- ProvenanceTree: indented border-l-2 with monospace IDs and inline TruthBadge on each rule and fact entry.
- JurisdictionGraphPanel: indented forest layout (supranational at the top, countries below, regions/municipalities nested) — chosen over a full SVG node-and-edge diagram for readability. Color dots per kind, edge relations shown inline.
- InvariantsReference: 18 cards in a 3-column responsive accordion, each with code, statement, detail, and category badge (kernel/temporal/truth/provenance/tenant/package/process).

## Verification
- `cd /home/z/my-project && bun run lint` → exit code 0 (0 errors, 0 warnings) after one eslint-disable for the canonical next-themes mounted-flag pattern.
- `curl -s http://localhost:3000/` → returns valid HTML containing "NOMOS", "Universal Rules-and-Reality Operating System", "Kernel: Frozen", "Context Builder".
- `curl -X POST http://localhost:3000/api/state` (with a Ghana→Togo preset body) → returns valid StateSnapshot JSON with ECOWAS free-movement rule firing (RIGHT_FREE_ENTRY).
- Agent-browser verification: page loads without console errors; clicking the "Ghana → Togo (Personal Effects)" preset immediately renders a State Snapshot card with "1 PERMISSIONS" fired and a Provenance Tree section. All 18 invariants (I1–I18) render in the invariants accordion; all 7 packages render in the Package Registry accordion with correct counts (jur.ecowas 3r, jur.afcfta 3r, pkg.situation.border-crossing 1s 2p, etc.).
- Full-page screenshot saved to `/home/z/my-project/agent-ctx/nomos-ui-screenshot.png`.

## Files NOT modified
- Did NOT touch: `src/kernel/`, `src/intelligence/`, `src/procedures/`, `src/situations/`, `src/packages/`, `src/platform/`, `src/lib/packages-data/`, `src/app/api/`.
- Modified only: `src/app/layout.tsx` (added ThemeProvider + Sonner Toaster), `src/app/page.tsx` (replaced the placeholder logo page with the full dashboard).
- Created: 13 new files under `src/components/nomos/` and `src/lib/nomos-*.ts`.

## Dependencies used (already installed)
- zustand@5.0.6 + zustand/middleware/immer (immer is shipped with zustand)
- framer-motion@12.23.2
- lucide-react@0.525.0
- next-themes@0.4.6
- sonner@2.0.6
- shadcn/ui (Card, Button, Input, Label, Switch, Checkbox, Badge, Select, ScrollArea, Accordion, Skeleton, Toaster)

No new packages were installed.
