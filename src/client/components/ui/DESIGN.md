# Xendelta Hub design language

Flat, outlined surfaces on one brand blue. Surfaces are separated by a 1px border, not by shadow.

## Tokens
| Token | Where | Use |
|---|---|---|
| `RADIUS` (`sm 4px`, `md 6px`, `lg 8px`, `xl 10px`, `pill`) | `theme/index.ts` | `borderRadius: RADIUS.lg`. Cards 8px, buttons 6px, dialogs 10px come from the theme. |
| `PAGE_MAX_WIDTH` | `theme/index.ts` | via `<PageContainer width=...>` |
| `brandGradient(theme)` | `theme/index.ts` | wordmarks, brand accents |
| `NEON`, `secondary` | `theme/index.ts` | public-page accent only, one gradient per page |
| `POINTS_GOLD` | `theme/index.ts` | points currency icon |
| `cardSx`, `sectionLabelSx`, `pageTitleSx`, `overlayButtonSx` | `ui/surfaceStyles.ts` | outlined surface, label, title, buttons over images |
| `CHART_COLORS` etc. | `ui/chartColors.ts` | every chart and label chip |

## Components (`components/ui/`)
`PageContainer` > `PageHeader` > content (`DetailHeader` instead of `PageHeader` for pages inside a book or group: back arrow, name, actions, tabs). `SectionCard` / `SectionLabel` for grouped content,
`EmptyState` / `ListSkeleton` for empty and loading,
`ResponsiveDialog` for dialogs (full screen on phones), `Banner` for fixed status strips.

## Rules
- Colours come from the theme (`primary.main`, `text.secondary`, `alpha(theme.palette.x, n)`). No hex or `rgba()`
  literals in pages. Exceptions: third-party brand marks
  (`AuthButton`), the files listed in `designLint.test.ts`.
- Cards are outlined, never raised. Do not pass `elevation` to `Paper`/`Card`; menus and snackbars keep theirs.
- One page title per page, via `PageHeader` (h5, `component="h1"`).
- Pick radii from `RADIUS`; do not invent values.
- Use `EmptyState` when a list is empty and a skeleton when the final shape is known.
