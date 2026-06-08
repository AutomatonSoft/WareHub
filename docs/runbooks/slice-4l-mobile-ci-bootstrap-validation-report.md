# Slice 4L - Mobile CI Bootstrap Validation Report

## 1. Summary

Slice 4L validated Flutter mobile CI bootstrap readiness for `apps/mobile` without changing mobile code, `pubspec` files, or CI workflow.

Result summary:

- `flutter pub get` passed
- `dart format --output=none --set-exit-if-changed .` failed
- `flutter analyze` passed
- `flutter test` passed

Main conclusion:

- mobile bootstrap is close to CI-ready
- but mobile should **not** be added to CI yet because formatting currently fails
- the next safe step is a narrow formatting-only fix slice before adding a mobile CI job

## 2. Git State

- CWD: `I:\WareHub`
- Branch: `feature/slice-4l-mobile-ci-bootstrap-validation`
- Preflight matched expected constraints:
  - path matched repo root
  - branch matched slice branch
  - working tree was clean
  - `HEAD` contained Slice 4K merge `9fa8912` or newer
- Final `git status --short`:
  - `?? docs/runbooks/slice-4l-mobile-ci-bootstrap-validation-report.md`

## 3. Tooling Versions

- `flutter --version` -> `Flutter 3.41.4`
- `dart --version` -> `Dart SDK version: 3.11.1`

## 4. Mobile Project Structure

Observed structure:

- package name: `sofortbot_mobile`
- project type: Flutter application
- SDK constraint in `pubspec.yaml`:
  - Dart: `>=3.5.0 <4.0.0`
- lockfile Flutter SDK constraint:
  - Flutter: `>=3.38.4`

Main dependencies include:

- `http`
- `image_picker`
- `mobile_scanner`
- `niimbot_label_printer` via local path dependency
- `permission_handler`
- `package_info_plus`
- `qr_flutter`
- `sentry_flutter`
- `shared_preferences`
- `local_auth`
- `flutter_secure_storage`
- `url_launcher`
- `web_socket_channel`

Dev dependencies:

- `flutter_test`
- `flutter_lints`

Linting config:

- `analysis_options.yaml` exists
- includes `package:flutter_lints/flutter.yaml`
- excludes `vendor/**`
- enables `avoid_print`

Tests:

- unit/widget tests exist in `apps/mobile/test`
- no separate integration/e2e test directory was found in the inspected scope

Platform/deploy hints:

- `README.md` contains flavor and deployment notes for `dev`, `stage`, `prod`
- README also contains mobile CI/CD and secrets discussion, but those are documentation hints only and were not executed in this slice

## 5. flutter pub get Result

Command:

- `flutter pub get`

Result:

- passed

Observed notes:

- dependencies resolved successfully
- multiple newer versions are available but incompatible with current constraints
- no dependency change was applied in this slice
- after `pub get`, root `git status --short` remained clean

This confirms mobile dependency bootstrap works on the current host.

## 6. dart format Check Result

Command:

- `dart format --output=none --set-exit-if-changed .`

Result:

- failed

The command reported formatting drift in multiple tracked files, including:

- `lib/app_strings_de.dart`
- `lib/app_strings_en.dart`
- `lib/app_strings_ru.dart`
- `lib/photo_upload_retry_policy.dart`
- `lib/photo_upload_telemetry.dart`
- `lib/qr_home_page_scan_add_flow.dart`
- `lib/qr_home_page_scan_add_handlers.dart`
- `lib/qr_home_page_scan_data.dart`
- several files under `test/`
- several files under `vendor/niimbot_label_printer/`

The tool output ended with:

- `Formatted 65 files (19 changed)`

Important observation:

- despite this output, root `git status --short` remained clean after the command
- no tracked drift was left behind in the repo state visible to Git

Interpretation:

- format policy is currently not satisfied
- this is a blocker for adding format as a green CI gate without a dedicated cleanup slice

## 7. flutter analyze Result

Command:

- `flutter analyze`

Result:

- passed

Analyzer output:

- `No issues found!`

This confirms static analysis is currently green.

## 8. flutter test Result

Command:

- `flutter test`

Result:

- passed

Observed details:

- `62` tests completed successfully
- final output: `All tests passed!`

This confirms test bootstrap works on the current host.

## 9. Generated Files / Git Ignore Check

Commands:

- `git status --ignored --short apps/mobile/.dart_tool`
- `git status --ignored --short apps/mobile/build`

Results:

- `.dart_tool`:
  - `!! apps/mobile/.dart_tool/`
- `build`:
  - `!! apps/mobile/build/`

Conclusion:

- generated Flutter directories are correctly ignored
- no `.gitignore` blocker was found for the mobile generated directories inspected in this slice

## 10. Env / Artifact Scan Results

Env scan result:

- only `.env.example` / `.env.*.example` files were found

Forbidden dirs scan result:

- scan was not empty
- findings are consistent with local ignored/generated noise, including:
  - `apps/backend/target`
  - `apps/frontend/node_modules`
  - `apps/frontend/.next`
  - `apps/mobile/.dart_tool`
  - `apps/mobile/build`
  - `services/database-service/.venv`
  - `services/orchestrator/.venv`
  - `.pytest_cache`
  - multiple `__pycache__` paths

Nested workflow scan result:

- root `.github` exists as expected
- additional nested `.github` matches were found only under `apps/frontend/node_modules`
- these are dependency-noise paths, not repo metadata drift

## 11. CI Readiness Recommendation

Current recommendation:

- do **not** add mobile CI job yet

Reason:

- `flutter pub get` passed
- `flutter analyze` passed
- `flutter test` passed
- but `dart format --output=none --set-exit-if-changed .` failed

Recommended next slice:

- `Slice 4M` should be a narrow mobile formatting cleanup/fix validation slice first

Only after formatting becomes green should a later CI slice add:

- `flutter pub get`
- `dart format --output=none --set-exit-if-changed .`
- `flutter analyze`
- `flutter test`

## 12. Blockers

- formatting is the current blocker for mobile CI onboarding

Specifically:

- `dart format --output=none --set-exit-if-changed .` is not green

## 13. Warnings

- the formatting command reported changed files, including files under the vendored `niimbot_label_printer` path dependency example code
- even though Git remained clean afterwards, this is still a signal that formatting policy is not currently satisfied
- README contains old CI/CD/deploy wording for mobile, but this slice did not validate or enact any of that flow
- forbidden-dir scan includes existing local ignored/generated noise outside this slice scope

## 14. Commands Run

Preflight:

- `Get-Location`
- `git branch --show-current`
- `git status --short`
- `git log --oneline -7`

Discovery:

- `flutter --version`
- `dart --version`
- `Get-Content apps/mobile/pubspec.yaml`
- `Get-Content apps/mobile/pubspec.lock`
- `Get-Content apps/mobile/analysis_options.yaml`
- `Get-Content apps/mobile/README.md`
- `Get-ChildItem apps/mobile/lib -Recurse -File | Select-Object FullName`
- `Get-ChildItem apps/mobile/test -Recurse -File | Select-Object FullName`

Validation:

- `flutter pub get`
- `git status --short`
- `dart format --output=none --set-exit-if-changed .`
- `flutter analyze`
- `flutter test`

Root-level checks:

- `git status --short`
- `git diff --stat`
- `git status --ignored --short apps/mobile/.dart_tool`
- `git status --ignored --short apps/mobile/build`
- `Get-ChildItem -Recurse -Force -File | Where-Object { $_.Name -match '^\.env(\..*)?$' } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.Name -in @('node_modules','target','.next','build','dist','venv','env','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.dart_tool','coverage') } | Select-Object FullName`
- `Get-ChildItem -Recurse -Force -Directory | Where-Object { $_.FullName -match '\\\.gitea$|\\\.github$' } | Select-Object FullName`

## 15. Proposed Slice 4M

Proposed next slice:

- `Slice 4M - mobile formatting readiness cleanup`

Suggested scope:

- mobile formatting only
- no CI workflow changes yet
- no deploy/signing changes

Target outcome:

- make `dart format --output=none --set-exit-if-changed .` pass cleanly
- re-run `flutter analyze`
- re-run `flutter test`
- if all green, then a later slice can add a mobile CI job
