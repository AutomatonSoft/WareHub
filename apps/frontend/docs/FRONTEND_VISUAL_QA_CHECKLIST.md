# Frontend Visual QA Checklist

Date: 2026-05-12
Scope: Inventory, Sofort list, Marketplace, Header/Sidebar, shared tables/forms/modals.

## 1) Contrast and readability
- Text on cards/tables uses primary/secondary/muted hierarchy and remains readable in light/dark themes.
- Status chips/banners (`success/warning/error/info`) have consistent contrast and semantics.
- Header and sidebar labels remain readable at normal and compact density.

## 2) Focus and keyboard states
- Interactive controls have visible focus rings (`focus-ring`).
- Table toolbar controls (search/select/buttons) are reachable and visually clear with keyboard navigation.
- Menu and modal actions keep consistent hover/focus/active states.

## 3) Alignment and spacing
- Desktop spacing rhythm aligned on 1366/1536/1920 via shared rhythm classes.
- Section titles, table toolbars and table containers follow one horizontal grid.
- Cell typography hierarchy is consistent (head/data/secondary/meta).

## 4) Overflow and clipping
- No page-level horizontal overflow on main flows at 100% scale.
- Long table content uses ellipsis and does not break row structure.
- Sticky columns/headers remain aligned while scrolling.

## 5) Empty/loading/error states
- Empty states are contextual by section (Inventory/Sofort/Marketplace variants).
- Skeleton states are visually consistent across mobile/desktop table views.
- Error banners use unified style and retry behavior.

## 6) Motion quality
- Sort/filter feedback uses subtle micro-animations (`ui-change-flash`, `ui-sort-bump`).
- Hover image previews are smooth and do not shift layout.
- Reduced-motion mode disables non-critical animations.

## 7) Scroll zones
- Long listing areas use unified scrollbar styling.
- Edge fade shadows are present for orientation in deep scroll areas.

## 8) Modals and overlays
- Modals share one system (`backdrop`, `panel`, `header`, `body`, `footer`).
- Overlay opacity and panel spacing are visually consistent.

## Result
- Critical visual regressions for target pages: none found in current baseline.
- Checklist revalidated after Phase 13 item 2-9 updates (gradient surfaces, table typography, filter grouping, hover previews, empty states, micro-animations, desktop spacing, scroll-zone polish).
- Follow-up: keep this checklist for every future visual phase and major table/layout change.
