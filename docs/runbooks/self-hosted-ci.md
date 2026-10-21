# WareHub self-hosted CI pilot

## Scope and status

This is an opt-in, manual pilot, not a replacement for the existing CI or deploy
workflows. Production approval, required checks, secrets, and the host nginx
configuration must remain unchanged. The public repository must not run arbitrary
pull request code on a persistent shared host runner.

### Verified preparation (2026-10-21)

- Host: `31.70.112.98`; guest name: `warehub-ci-pilot`.
- Official runner `2.338.0` registered to this repository as
  `warehub-ci-pilot-server4`, ID `21`, with only label `warehub-ci-pilot` and
  ephemeral registration. Its guest service is disabled and inactive.
- After validation, the guest was shut down gracefully. The host VM service is
  inactive and disabled at boot. The ephemeral runner unregistered after its first job.
- Cloud-init completed; the exact smoke step from the pilot workflow passed when
  invoked manually inside the guest as `runner`, including guest Docker hello-world.
  This initial manual check was followed by the successful Actions run below.
- Probes could not obtain host SSH responses through `10.0.2.2`, the public host
  IP, `172.18.0.1`, `172.19.0.1`, or `192.168.0.1`; GitHub HTTPS and guest Docker
  downloads worked. These probes are bounded checks, not a complete security audit.
- Host nginx config hashes, master PID, running container IDs, and container restart
  counts/start times matched the pre-provision baseline. `nginx -t` passed with
  existing protocol-option warnings; QEMU exposed no TCP listener.
- A diagnostic invocation of Ubuntu's `lxc` installer stub automatically installed
  LXD. The empty installation was removed without creating instances, storage, or
  managed networks. A temporary CI-only nftables table used during diagnostics was
  also removed; no custom firewall table is required by this configuration.
- After the pilot was merged into both `main` (the default branch, required for
  `workflow_dispatch`) and `stage`, the first Actions dispatch on `stage` succeeded:
  https://github.com/AutomatonSoft/WareHub/actions/runs/39559183179
  Job `119086066827` ran on runner `21`, `warehub-ci-pilot-server4`. GitHub reported
  `success`; the tool checks and guest Docker hello-world passed. The ephemeral
  runner was removed automatically, its guest service was stopped, and the VM
  was powered off. Final host nginx hashes/PID remained unchanged. Container
  baseline hashes changed during this later check: `gads-backend-1` and
  `gads-worker-maintenance-1` had new start timestamps at 07:02:55 UTC, after the
  pilot job ended at 07:02:31 UTC. No host container restart/recreate commands were
  issued by this pilot; the cause of those two changes was not established.
- Existing CI/deploy workflows have not been switched and no deployment was triggered.

### Orchestrator preparation (2026-10-21)

- The manual pilot now offers `suite=orchestrator`; `smoke` remains the default.
  The new option still requires normal review/merge before an Actions run.
- The exact dependency-install, compile, and pytest shell commands from this option
  were run manually as `runner` inside the same limited VM against stage commit
  `2cc39db552cbf82b9fdd8b86cfeaca5d80337d14`, downloaded as a public GitHub archive.
  No host checkout, `.env`, token, or deployment credentials were copied into the guest.
- Result: **158 passed, 1 warning in 50.47 seconds**, Python **3.13.16**. The warning
  concerned deprecated httpx use by Starlette TestClient; no application code was changed.
- This verifies the tests on the VM, not the new checkout/setup actions in GitHub.
  The latter need a fresh ephemeral registration and an Actions dispatch after merge.

## Isolation

- Run `infra/ci/warehub-ci-vm.service` on the CI host with KVM and Ubuntu 24.04.
- Use a dedicated `warehub-ci-vm` system user with KVM access, no sudo, no host
  Docker group membership, and no host filesystem mounts in the guest.
- Guest: 2 vCPU, 4 GiB RAM, and a standalone 40 GiB qcow2 disk.
- Host service: 2 CPU quota, 5 GiB memory maximum, no swap, low CPU/I/O priority,
  and bounded disk bandwidth. Guest Docker is separate from the host daemon.
- Use QEMU user networking without port forwarding. No bridge, host firewall
  changes, public listener, or nginx route is required.
- The service blocks loopback, private/link-local destinations, and this CI host's
  public IPv4 address. Host sockets are IPv4-only and guest IPv6 is disabled.
  Configure guest DNS explicitly to public resolvers via
  cloud-init network configuration. Verify the systemd IP filters are effective
  before allowing any workflow. Other public service endpoints are not blocked.
  Do not mistake the guest Docker bridge for the host's bridge: both may use
  `172.17.0.1`. Probe host addresses that are not locally assigned inside the VM.
- `infra/ci/cloud-init.yaml` installs tools and a checksum-pinned official runner.
  It contains no registration token, application credentials, or SSH keys.

## Registration and first check

1. Verify host container IDs, restart counts, listener set, nginx file hashes,
   nginx PID, available memory, and `nginx -t` before provisioning.
2. Install QEMU and cloud-image-utils from Ubuntu repositories without upgrading
   unrelated packages. Verify an official Ubuntu cloud image against its published
   SHA256 checksum; copy it to the standalone disk and resize that disk to 40 GiB.
3. Generate a NoCloud seed from the supplied cloud config, unique instance ID,
   and DHCP network config using public DNS. Start only `warehub-ci-vm.service`.
4. Use the local root-only QEMU guest-agent socket for administration. Check
   cloud-init succeeded and `/var/lib/warehub-runner-prepared` exists.
5. Register as `runner` for **AutomatonSoft/WareHub only**, using a fresh short-lived
   registration token, `--ephemeral --no-default-labels --labels warehub-ci-pilot`.
   Never log or commit the token. Install the runner service inside the guest,
   but keep it stopped until the reviewed pilot is ready to run.
6. Merge the manual pilot workflow through normal review. Dispatch it on `stage`
   or `main`, confirm the selected runner and successful Docker smoke output.
   Select `suite=smoke` for the tooling check or `suite=orchestrator` for Python
   3.13 compilation and pytest, matching the existing orchestrator CI job.
   The orchestrator option checks out the selected trusted branch without persisting
   Git credentials. No PR trigger, environment secrets, or deploy access is used.
   Start the guest runner only for this controlled test. Labels are routing, not
   authorization: a different workflow can request the same label. Check queued
   jobs and use organization workflow-restricted runner groups if available before
   enabling an unattended runner for this public repository.
7. The ephemeral runner unregisters after one job. Stop the VM after the pilot;
   do not reuse its disk to execute different trust levels.
8. Repeat host checks. A running VM or an online runner alone is not a passed CI job.

The runner is ephemeral: before a subsequent controlled run, register it again with
a fresh short-lived token. Do not start a stale service after its registration was
removed. Keep the runner offline until the intended job is queued. The optional
orchestrator suite does not move or replace the existing required `orchestrator`
PR check; it is the next capacity/compatibility pilot before CI migration.

Do not switch the existing jobs yet. Full migration requires verified resource
measurements, guest reset between jobs, trusted-code gates for this public repo,
toolchain coverage for Python/Node/Rust/Flutter/buildx, disk/cache cleanup and a
separate decision on deploy credentials. Four GiB is a pilot limit, not evidence
that the full frontend or Docker builds will fit.

## Rollback

### Full workflow routing (prepared, not activated)

All existing GitHub-hosted jobs now use the repository-level switch
`WAREHUB_RUNNER_LABELS`, parsed as a JSON array. The pilot retains its dedicated
`warehub-ci-pilot` label. An unset/empty switch selects `["ubuntu-latest"]`, so
merging this change alone does not move jobs or require a runner to be online.

Covered workflows: `ci.yml`, `ghcr-publish.yml`, `stage-deploy.yml`,
`prod-deploy.yml`, both mobile APK release workflows, `stage-compose-preflight.yml`,
and the disabled legacy `stage-runtime-reconcile.yml` (still disabled).
No job IDs, dependencies, trigger conditions, permissions, environment approvals,
deployment commands, or existing timeouts are changed by routing.

Do not set the switch until all prerequisites below have passed:

1. An unattended controller on the CI server registers a new ephemeral runner and
   starts a fresh disposable VM disk for **each job**, with a maximum of one VM at
   a time. Poweroff alone is not a guest reset. After completion/failure/cancellation,
   destroy only that job's overlay; never reuse a PR job's disk for a deploy job.
2. Use a GitHub App installed **only on AutomatonSoft/WareHub**, with repository
   Administration read/write (runner registration/removal), Actions read (queue
   observation), and implicit Metadata read. Keep the App private key root-only on
   the controller, outside this checkout and outside the VM; send the guest only
   the short-lived registration token. Do not copy a personal `gh` OAuth token to
   the server. App setup/installation and controller implementation are outstanding.
3. Rebuild and validate a clean guest image using the extended cloud-init package
   list: Docker Compose v2/buildx, Ruby, SSH/rsync, native build tools, SSL/Clang,
   archive tools and Flutter system libraries. Workflow setup actions continue to
   install Python/Node/Rust/Java/Flutter versions. The old pilot disk does **not**
   gain the new packages merely because this YAML changed.
4. Provision an Android SDK for both APK workflows, with the required platform,
   build-tools and NDK matching Flutter/Gradle, and licenses accepted by the account
   owner. The original hosted runner supplied this SDK; the pilot image does not.
   Never treat the Docker smoke or orchestrator tests as proof of APK readiness.
5. Validate every CI job on the candidate image, especially frontend, Rust, Docker
   and Flutter builds, with measured peak RAM/disk usage. Keep the current resource
   ceiling until measurements justify a separately approved change. No blanket
   capacity claim is made for the shared server.
6. Confirm the VM can reach the existing deployment SSH destination with the
   existing pinned host keys and environment credentials, without changing its
   private-network deny rules or the host nginx/firewall. Retain production review
   gates. Do not execute deployment or migrations merely to test runner routing.
7. Confirm the controller and runner are available before enabling routing:
   `gh variable set WAREHUB_RUNNER_LABELS --repo AutomatonSoft/WareHub --body '["warehub-ci"]'`.
   The new runner must have the custom `warehub-ci` label. Labels alone are not an
   authorization boundary; public PRs require the per-job VM reset described above.

For immediate routing rollback, delete **only** this repository variable:
`gh variable delete WAREHUB_RUNNER_LABELS --repo AutomatonSoft/WareHub`.
Newly scheduled jobs use GitHub-hosted runners again. Already queued/running jobs
may require cancellation and a fresh dispatch. Do not remove protection rules or
production approvals to unblock a cutover.

### Pilot rollback

Stop and disable **only** `warehub-ci-vm.service`; remove the pilot runner from
this repository if it remains registered. Revert the pilot workflow through a PR.
Keep the disk for diagnosis until explicit cleanup approval. Existing workflows
still use GitHub-hosted runners. Never run host-wide Docker prune, Compose down,
nginx reload, firewall reset, or restart another project's runner as rollback.

## References

- https://docs.github.com/en/actions/reference/security/secure-use
- https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners
- https://www.qemu.org/docs/master/system/devices/net.html
