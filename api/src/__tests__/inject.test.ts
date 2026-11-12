import { describe, it, expect } from 'vitest'
import { buildInjectionScript } from '../inject.js'

describe('buildInjectionScript', () => {
  it('should generate valid script with report URL', () => {
    const script = buildInjectionScript('http://localhost:3001/api/auto-detect/report/session-1')
    expect(script).toContain('http://localhost:3001/api/auto-detect/report/session-1')
  })

  it('should include floating button code', () => {
    const script = buildInjectionScript('http://test.com/report')
    expect(script).toContain('__autoDetectBtn')
    expect(script).toContain('识别')
  })

  it('should check for existing injection', () => {
    const script = buildInjectionScript('http://test.com/report')
    expect(script).toContain('window.__autoDetectInjected')
  })

  it('should escape special characters in URL', () => {
    const script = buildInjectionScript('http://localhost:3001/api/report/test')
    expect(script).toContain('http://localhost:3001/api/report/test')
  })
})
