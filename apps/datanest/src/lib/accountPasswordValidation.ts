export function validatePasswordChange({
  currentPassword,
  newPassword,
  confirmPassword,
}: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  if (newPassword.length < 12) {
    return "Use a new password with at least 12 characters.";
  }
  if (newPassword.length > 128) {
    return "Use a new password with 128 characters or fewer.";
  }
  if (newPassword !== confirmPassword) {
    return "The new passwords do not match.";
  }
  if (currentPassword === newPassword) {
    return "Choose a new password that differs from your current password.";
  }
  return null;
}
