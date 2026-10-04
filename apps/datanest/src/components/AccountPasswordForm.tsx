"use client";

type Props = {
  busy: boolean;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onRecovery: () => void;
};

export default function AccountPasswordForm({
  busy,
  currentPassword,
  newPassword,
  confirmPassword,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onRecovery,
}: Props) {
  return <>
    <label>Current password
      <input type="password" required autoComplete="current-password" value={currentPassword} onChange={event=>onCurrentPasswordChange(event.target.value)} placeholder="Current password"/>
    </label>
    <label>New password
      <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={newPassword} onChange={event=>onNewPasswordChange(event.target.value)} placeholder="At least 12 characters"/>
    </label>
    <label>Confirm new password
      <input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={event=>onConfirmPasswordChange(event.target.value)} placeholder="Re-enter new password"/>
    </label>
    <div className="accountSecurityActions">
      <button className="primaryButton compact" type="submit" disabled={busy}>{busy?"Working…":"Change password"}</button>
      <button className="secondaryButton compact" type="button" disabled={busy} onClick={onRecovery}>Email reset link</button>
    </div>
  </>;
}
