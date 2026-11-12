import { describe, it, expect } from 'vitest'
import { cn } from '../lib/utils.js'

describe('cn', () => {
  it('should merge class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1')
  })

  it('should handle conditional classes', () => {
    const condition = true
    expect(cn('base', condition && 'conditional')).toBe('base conditional')
  })

  it('should handle empty inputs', () => {
    expect(cn()).toBe('')
    expect(cn(undefined, null, false)).toBe('')
  })

  it('should merge conflicting classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-green-500')).toBe('text-green-500')
  })
})
