# Frontend Visual Baseline

## Required snapshots

- `e2e/__screenshots__/visual-regression.spec.ts/inventory-page.png`
- `e2e/__screenshots__/visual-regression.spec.ts/sofort-list-page.png`
- `e2e/__screenshots__/visual-regression.spec.ts/marketplace-page.png`

## Generate / refresh baseline

```bash
E2E_VISUAL=1 npm run test:e2e:visual:update
```

## Validate baseline in repo

```bash
npm run visual:baseline:check
```

## Notes

- Baseline update must be done intentionally in stable environment.
- Any baseline change should be reviewed in PR as expected UI change.
