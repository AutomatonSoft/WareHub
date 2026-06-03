export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateAvatarFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Avatar must be an image file.";
  }
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return "Avatar format must be JPG, PNG, WEBP, or GIF.";
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return "Avatar file must be up to 5 MB.";
  }

  return null;
}

export function validateNewPassword(newPassword: string, confirmPassword: string): string | null {
  if (newPassword.length < 8) {
    return "New password must be at least 8 characters.";
  }

  if (newPassword !== confirmPassword) {
    return "New passwords do not match.";
  }

  return null;
}
