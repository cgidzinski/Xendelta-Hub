# Xendelta Hub

## UI work
Before changing or adding any client UI, read `src/client/components/ui/DESIGN.md`. It is the
design language: theme tokens, the shared components in `src/client/components/ui/`
(`PageContainer`, `PageHeader`, `SectionLabel`, `SectionCard`, `EmptyState`, `ListSkeleton`,
`ResponsiveDialog`, `Banner`) and the colour/radius/elevation rules.

- Use theme tokens, not hex or `rgba()` literals. `src/client/designLint.test.ts` fails on new ones.
- Reuse the shared components before hand-writing headers, labels, empty states or dialogs.

## Checks
`npm run type-check`, `npm test`, `npm run build`.
