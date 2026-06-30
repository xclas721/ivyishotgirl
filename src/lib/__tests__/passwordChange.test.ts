import { describe, expect, it } from 'vitest'
import { validatePasswordChange } from '@/lib/passwordChange'

describe('validatePasswordChange', () => {
  it('requires current password', () => {
    expect(validatePasswordChange('', 'newpass', 'newpass')).toBe('請輸入目前密碼')
  })

  it('requires minimum length', () => {
    expect(validatePasswordChange('old123', '12345', '12345')).toBe('新密碼至少 6 個字元')
  })

  it('requires matching confirmation', () => {
    expect(validatePasswordChange('old123', 'newpass1', 'newpass2')).toBe('兩次輸入的新密碼不一致')
  })

  it('rejects same password', () => {
    expect(validatePasswordChange('samepw', 'samepw', 'samepw')).toBe('新密碼不能與目前密碼相同')
  })

  it('accepts valid input', () => {
    expect(validatePasswordChange('old123', 'newpass1', 'newpass1')).toBeNull()
  })
})
