# Stage to Main Promotion Checklist

## Purpose

Use this checklist when promoting validated `stage` into `main`.

- This is not a deploy checklist.
- This does not create releases or tags.
- This does not run migrations.

## Preconditions

- Current local branch is `stage`.
- `stage` is up to date with `origin/stage`.
- Local working tree is clean.
- `main` branch protection is configured before first promotion.
- `stage` branch protection is configured.
- No critical open PRs targeting `stage`.
- No deploy or migration work is mixed into the promotion.
- Latest CI on stage PR history is green.

## Required Checks

Required checks for the `stage -> main` PR:

- `CI / repo-safety`
- `CI / compose-config`
- `CI / database-service`
- `CI / frontend`
- `CI / mobile`
- `CI / orchestrator`
- `CI / rust-backend`

Optional:

- `CI / rust-backend-metadata`

## Local Preflight Commands

PowerShell commands:

```powershell
cd I:\WareHub
git checkout stage
git pull origin stage
git status
git log --oneline -10
gh pr status
gh run list --limit 10
```

## Create Promotion PR

Command template only. Do not execute automatically from this checklist.

```powershell
gh pr create `
  --base main `
  --head stage `
  --title "Promote stage to main: CI baseline" `
  --body "..."
```

Promotion PR body should include:

- Summary
- CI baseline
- Required checks
- Explicit no-deploy statement
- Rollback plan

## Promotion PR Body Template

```markdown
## Summary

Promote validated `stage` into `main` using the current CI baseline.

## CI Baseline

- CI / repo-safety
- CI / compose-config
- CI / database-service
- CI / frontend
- CI / mobile
- CI / orchestrator
- CI / rust-backend

Optional:

- CI / rust-backend-metadata

## No-Deploy Statement

- No deploy is included in this PR.
- No migrations are included in this PR.
- No release tags are created by this PR.
- No production changes are performed by this PR.

## Rollback Plan

- If needed, revert the merge commit on `main`.
- Do not run DB rollback.
- Do not touch infrastructure.
- Do not trigger deploy automatically.
```

## Merge Rules

- Wait for all required checks.
- Merge only after green CI.
- Do not squash unless repository policy changes.
- Do not tag release.
- Do not deploy.

## Post-Merge Verification

Commands:

```powershell
git checkout main
git pull origin main
git status
git log --oneline -10
```

Then return to `stage`:

```powershell
git checkout stage
git pull origin stage
git status
```

## Rollback

- Use `git revert` on the `main` merge commit.
- Do not run DB rollback.
- Do not touch infrastructure.
- Do not deploy automatically.

## Deferred Work

- Docker build validation
- stage/prod deploy strategy
- migration validation
- release tagging
- environment protection
- secret scanning
- artifact publishing
