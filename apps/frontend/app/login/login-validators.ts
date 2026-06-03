export const PASSWORD_REQUIREMENTS = "password_requirements";

export function validateEmail(value: string): string | null {
  const normalizedEmail = value.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 254) {
    return "email_non_empty_max_254";
  }
  if (/\s/.test(normalizedEmail)) {
    return "email_no_spaces";
  }
  if ((normalizedEmail.match(/@/g) || []).length !== 1) {
    return "email_single_at";
  }
  const [emailLocal, emailDomain] = normalizedEmail.split("@");
  if (!emailLocal || !emailDomain) {
    return "email_local_domain_required";
  }
  if (emailDomain.startsWith(".") || emailDomain.endsWith(".")) {
    return "email_domain_no_edge_dot";
  }
  if (!emailDomain.includes(".")) {
    return "email_domain_has_dot";
  }
  if (emailDomain.split(".").some((part) => part.length === 0)) {
    return "email_domain_no_empty_labels";
  }
  return null;
}

export function validateLogin(value: string): string | null {
  const normalizedLogin = value.trim().toLowerCase();
  if (normalizedLogin.length < 3 || normalizedLogin.length > 64) {
    return "login_len_3_64";
  }
  if (!/^[a-z0-9._-]+$/.test(normalizedLogin)) {
    return "login_unsupported_chars";
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 8 || value.length > 128) {
    return "password_len_8_128";
  }
  if (!/[A-Z]/.test(value) || !/[0-9]/.test(value)) {
    return PASSWORD_REQUIREMENTS;
  }
  return null;
}

export function validatePersonName(value: string, fieldLabel: string): string | null {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 64) {
    return `${fieldLabel}:person_name_len_1_64`;
  }
  return null;
}

export function validatePhoneNumber(value: string): string | null {
  const normalized = value.trim();
  if (normalized.length < 7 || normalized.length > 24) {
    return "phone_len_7_24";
  }
  if (!/^[0-9+\-() ]+$/.test(normalized)) {
    return "phone_unsupported_chars";
  }
  return null;
}
