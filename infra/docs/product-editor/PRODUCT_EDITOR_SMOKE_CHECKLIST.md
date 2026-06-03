# Product Editor Smoke Checklist

Last updated: 2026-05-22
Scope: Manual smoke checklist for Product Editor MVP control-plane rollout

## Preconditions

- Orchestrator service is running
- Frontend is running on the expected local or stage target
- Auth/session is valid
- Test EANs are available for:
  - HOOD found
  - JV found
  - no targets found

## HOOD smoke

- Open `/product-editor`
- Enter a valid 13-digit EAN with known HOOD hit
- Confirm discover completes without direct-service errors
- Confirm `HOOD` tab is selected when HOOD target is found
- Confirm target matrix shows:
  - `HOOD_JV` or `HOOD_XL` as `found`
  - unsupported/planned tabs remain non-actionable
- Open `HOOD` tab
- Confirm draft fields load through Orchestrator
- Change one scalar field such as `price`
- Confirm dirty state becomes visible
- Click `Review Changes`
- Confirm plan is generated
- Confirm plan shows:
  - exact target
  - changed fields
  - warnings
- Confirm apply is blocked until confirmation is checked
- Check confirmation and click apply
- Confirm result/job panel appears
- Confirm target result is shown

## HOOD image smoke

- Load a HOOD product with existing images
- Remove one image from product draft
- Confirm UI does not describe this as FTP delete
- Select a local file
- Confirm file appears only in pending uploads
- Confirm no upload happens on selection
- Click `Review Changes`
- Confirm pending upload warning is visible

## JV smoke

- Enter a valid 13-digit EAN with known JV hit
- Confirm target matrix shows found JV sites
- Confirm `JV_MAIN` never appears
- Open `JV` tab
- Confirm baseline resolves to:
  - `JV_DE`, else
  - `JV_CH`, else
  - `JV_AT`
- Confirm `JV_CO_UK` is not auto-baseline
- Confirm JV draft loads through Orchestrator
- Change one scalar field such as `price`
- Confirm dirty state becomes visible
- Click `Review Changes`
- Confirm plan target scope includes all found JV sites
- If `JV_CO_UK` is in scope, confirm translation warning is visible
- Confirm apply is blocked until confirmation is checked
- Check confirmation and click apply
- Confirm result/job panel appears
- Confirm per-target result rows are shown

## Placeholder tabs smoke

- Open `XL`, `OTTO`, `KAUFLAND`, and `EBAY` tabs
- Confirm each tab has explicit non-actionable rollout copy
- Confirm no draft editor appears for these tabs
- Confirm no review/apply controls appear for these tabs
- Confirm status matrix still shows their targets

## Regression smoke

- Confirm searching invalid EAN does not trigger discover
- Confirm changing draft after plan clears stale plan state
- Confirm switching tabs does not trigger hidden apply
- Confirm page never calls legacy direct mutation UX from Product Editor

## Signoff criteria

- HOOD discover/load/plan/apply/result flow works
- JV discover/load/plan/apply/result flow works
- Placeholder tabs are honest and non-actionable
- No hidden live update occurs without review and confirmation
