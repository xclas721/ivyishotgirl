export function validatePasswordChange(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): string | null {
  if (!currentPassword.trim()) return '請輸入目前密碼'
  if (newPassword.length < 6) return '新密碼至少 6 個字元'
  if (newPassword !== confirmPassword) return '兩次輸入的新密碼不一致'
  if (newPassword === currentPassword) return '新密碼不能與目前密碼相同'
  return null
}
