import assert from "node:assert/strict";
import test from "node:test";

import { validatePasswordChange } from "../../src/lib/accountPasswordValidation.ts";

test("accepts a valid password change", () => {
  assert.equal(
    validatePasswordChange({
      currentPassword: "current-password",
      newPassword: "different-password",
      confirmPassword: "different-password",
    }),
    null
  );
});

// These messages are part of the account-security UX contract and must remain stable.
test("preserves password validation messages", () => {
  assert.equal(
    validatePasswordChange({
      currentPassword: "current-password",
      newPassword: "short",
      confirmPassword: "short",
    }),
    "Use a new password with at least 12 characters."
  );

  const longPassword = "x".repeat(129);
  assert.equal(
    validatePasswordChange({
      currentPassword: "current-password",
      newPassword: longPassword,
      confirmPassword: longPassword,
    }),
    "Use a new password with 128 characters or fewer."
  );

  assert.equal(
    validatePasswordChange({
      currentPassword: "current-password",
      newPassword: "different-password",
      confirmPassword: "different-passw0rd",
    }),
    "The new passwords do not match."
  );

  assert.equal(
    validatePasswordChange({
      currentPassword: "same-password",
      newPassword: "same-password",
      confirmPassword: "same-password",
    }),
    "Choose a new password that differs from your current password."
  );
});
