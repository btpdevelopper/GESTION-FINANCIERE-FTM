---
name: UI Component System
description: Shared UI component library at src/components/ui/ — always use these instead of inline Tailwind for standard UI elements
type: project
---

A B2B-oriented design system was built and applied. All new UI should follow these conventions.

**Why:** The user requested a professional, information-dense interface — no consumer-grade animations, large rounded corners, or heavy shadows.

**How to apply:** Always import from `@/components/ui` for standard elements. Never write inline Tailwind for buttons, badges, cards, inputs, modals, alerts, or empty states.

## Components (`src/components/ui/`)

| Export | File | Use for |
|---|---|---|
| `Button` | `button.tsx` | All buttons. Variants: `primary`, `ghost`, `danger`, `danger-solid`. Sizes: `sm`, `md`, `lg`. |
| `Badge`, `RoleBadge`, `StatusBadge`, `roleBadgeClass` | `badge.tsx` | Status pills, role labels. `RoleBadge` handles MOA/MOE/ENTREPRISE. `StatusBadge` handles situation statuses. |
| `Card`, `CardSubsection` | `card.tsx` | Panel wrappers. `Card` = white bordered panel. `CardSubsection` = inner subtle section. Add `p-4` or `p-3` as className. |
| `Input`, `Select`, `INPUT_CLS` | `input.tsx` | Form inputs and selects. Forward-ref compatible. |
| `ModalOverlay`, `ModalContainer`, `ModalHeader`, `ModalFooter` | `modal.tsx` | All modals. Use these 4 together — no more duplicated overlay patterns. |
| `Alert` | `alert.tsx` | Error/warning/success/info banners. Variants: `error`, `warning`, `success`, `info`. |
| `EmptyState` | `empty-state.tsx` | Empty list states. Props: `icon`, `title`, `description`, `action`, `dashed`. |
| `TabNav`, `TabNavButton`, `TabNavLink`, `TAB_ACTIVE_CLS`, `TAB_INACTIVE_CLS` | `tab-nav.tsx` | Tab navigation bars. |

## Design tokens
- Corners: `rounded` (4px) everywhere — never `rounded-xl`, `rounded-2xl`, `rounded-full` for UI elements
- Primary button: `bg-slate-800 hover:bg-slate-700` (NOT indigo)
- Active tab indicator: `border-slate-800` (NOT indigo)
- No `active:scale-95`, no `hover:shadow-lg`, no shimmer animations
- Cards: `border border-slate-200` with no shadow or just `shadow-sm`
- Text: `text-sm` standard data, `text-xs` secondary/labels
