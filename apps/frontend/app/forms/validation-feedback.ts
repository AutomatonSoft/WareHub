type ValidationLabels = Record<string, string>;

export function translateValidationErrorCode(labels: ValidationLabels, code: string): string {
  const [fieldLabel, fieldCode] = code.split(":");
  if (fieldCode === "person_name_len_1_64") {
    return `${fieldLabel} ${labels.mustBeBetween1And64Chars ?? "must be between 1 and 64 chars"}`;
  }
  switch (code) {
    case "email_non_empty_max_254":
      return labels.emailNonEmptyMax254 ?? code;
    case "email_no_spaces":
      return labels.emailNoSpaces ?? code;
    case "email_single_at":
      return labels.emailSingleAt ?? code;
    case "email_local_domain_required":
      return labels.emailLocalDomainRequired ?? code;
    case "email_domain_no_edge_dot":
      return labels.emailDomainNoEdgeDot ?? code;
    case "email_domain_has_dot":
      return labels.emailDomainHasDot ?? code;
    case "email_domain_no_empty_labels":
      return labels.emailDomainNoEmptyLabels ?? code;
    case "login_len_3_64":
      return labels.loginLen3to64 ?? code;
    case "login_unsupported_chars":
      return labels.loginUnsupportedChars ?? code;
    case "password_len_8_128":
      return labels.passwordLen8to128 ?? code;
    case "password_requirements":
      return labels.passwordRequirements ?? code;
    case "phone_len_7_24":
      return labels.phoneLen7to24 ?? code;
    case "phone_unsupported_chars":
      return labels.phoneUnsupportedChars ?? code;
    default:
      return code;
  }
}
