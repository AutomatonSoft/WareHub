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
  inactive and disabled at boot; the registered GitHub runner is intentionally offline.
- Cloud-init completed; the exact smoke step from the pilot workflow passed when
  invoked manually inside the guest as `runner`, including guest Docker hello-world.
  This is **not** a completed GitHub Actions run.
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
- Existing workflows have not been switched, no deployment was triggered, and the
  pilot workflow still needs normal review/merge before its first Actions dispatch.

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
   No PR trigger, checkout, environment secrets, or deploy access is used by the pilot.
   Start the guest runner only for this controlled test. Labels are routing, not
   authorization: a different workflow can request the same label. Check queued
   jobs and use organization workflow-restricted runner groups if available before
   enabling an unattended runner for this public repository.
7. The ephemeral runner unregisters after one job. Stop the VM after the pilot;
   do not reuse its disk to execute different trust levels.
8. Repeat host checks. A running VM or an online runner alone is not a passed CI job.

Do not switch the existing jobs yet. Full migration requires verified resource
measurements, guest reset between jobs, trusted-code gates for this public repo,
toolchain coverage for Python/Node/Rust/Flutter/buildx, disk/cache cleanup and a
separate decision on deploy credentials. Four GiB is a pilot limit, not evidence
that the full frontend or Docker builds will fit.

## Rollback

Stop and disable **only** `warehub-ci-vm.service`; remove the pilot runner from
this repository if it remains registered. Revert the pilot workflow through a PR.
Keep the disk for diagnosis until explicit cleanup approval. Existing workflows
still use GitHub-hosted runners. Never run host-wide Docker prune, Compose down,
nginx reload, firewall reset, or restart another project's runner as rollback.

## References

- https://docs.github.com/en/actions/reference/security/secure-use
- https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners
- https://www.qemu.org/docs/master/system/devices/net.html
