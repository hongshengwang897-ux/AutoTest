import { describe, it, expect } from 'vitest'
import { wrapScript } from '../execution-engine.js'

describe('wrapScript', () => {
  it('should extract test body from standard format', () => {
    const script = `
import { test, expect } from '@playwright/test';
test('登录测试', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="username"]', 'admin');
});
`
    const result = wrapScript(script)
    expect(result).toContain('await page.goto')
    expect(result).not.toContain('import')
    expect(result).not.toContain('test(')
  })

  it('should handle script without test wrapper', () => {
    const script = `
await page.goto('/login');
await page.click('button');
`
    const result = wrapScript(script)
    expect(result).toContain('await page.goto')
  })

  it('should remove import statements', () => {
    const script = `
import { test } from '@playwright/test';
import { expect } from 'playwright';
test('test', async ({ page }) => {});
`
    const result = wrapScript(script)
    expect(result).not.toContain('import')
  })

  it('should return body for inline test format', () => {
    const script = `test('my test', async ({ page }) => {
  await page.goto('/');
});`
    const result = wrapScript(script)
    expect(result).toContain('await page.goto')
    expect(result).not.toContain('test(')
  })
})
