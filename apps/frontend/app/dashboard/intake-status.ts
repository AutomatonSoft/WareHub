import type { IntakeDto } from "../client-api";

const INACTIVE_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function intakeIsActive(item: IntakeDto): boolean {
  if (typeof item.is_active === "boolean") {
    return item.is_active;
  }
  return !item.is_removed;
}

export function inactiveDaysLeft(item: IntakeDto, nowMs = Date.now()): number | null {
  if (intakeIsActive(item)) {
    return null;
  }
  const source = item.removed_at ?? item.created_at;
  const removedAtMs = Date.parse(source);
  if (Number.isNaN(removedAtMs)) {
    return INACTIVE_RETENTION_DAYS;
  }
  const expiresAt = removedAtMs + INACTIVE_RETENTION_DAYS * DAY_MS;
  const leftMs = Math.max(0, expiresAt - nowMs);
  return Math.ceil(leftMs / DAY_MS);
}
