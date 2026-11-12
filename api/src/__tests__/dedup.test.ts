import { describe, it, expect } from 'vitest'
import { dedupBySelector, suggestName, buildSelector } from '../dedup.js'
import type { DetectedElement } from '../types.js'

describe('dedupBySelector', () => {
  it('should deduplicate elements by selector', () => {
    const elements: DetectedElement[] = [
      { id: '1', selector: '#btn-submit', type: 'button', suggestedName: '按钮', checked: true, selectorType: 'css' },
      { id: '2', selector: '#btn-submit', type: 'button', suggestedName: '按钮', checked: true, selectorType: 'css' },
      { id: '3', selector: '#input-name', type: 'input', suggestedName: '输入框', checked: true, selectorType: 'css' },
    ]
    const result = dedupBySelector(elements)
    expect(result).toHaveLength(2)
    expect(result.map(e => e.id)).toEqual(['1', '3'])
  })

  it('should drop elements with empty selector', () => {
    const elements: DetectedElement[] = [
      { id: '1', selector: '', type: 'button', suggestedName: '按钮', checked: true, selectorType: 'css' },
      { id: '2', selector: '#btn', type: 'button', suggestedName: '按钮', checked: true, selectorType: 'css' },
    ]
    const result = dedupBySelector(elements)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('should return empty array for empty input', () => {
    expect(dedupBySelector([])).toEqual([])
  })
})

describe('suggestName', () => {
  it('should prefer aria-label over other attributes', () => {
    const result = suggestName('button', 'button', 'Click me', {
      'aria-label': 'Submit Form',
      'data-testid': 'submit-btn',
    })
    expect(result).toBe('Submit Form')
  })

  it('should use text when no attributes', () => {
    const result = suggestName('button', 'button', 'Submit Form', {})
    expect(result).toBe('Submit Form')
  })

  it('should fallback to type + tag', () => {
    const result = suggestName('button', 'button', '', {})
    expect(result).toBe('按钮 (button)')
  })

  it('should truncate long text', () => {
    const longText = 'a'.repeat(40)
    const result = suggestName('span', 'text', longText, {})
    expect(result.length).toBeLessThanOrEqual(30)
  })
})

describe('buildSelector', () => {
  it('should prefer data-testid', () => {
    const result = buildSelector({
      tag: 'button',
      attrs: { 'data-testid': 'submit-btn' },
      indexAmongSiblings: 0,
    })
    expect(result.selector).toContain('submit-btn')
    expect(result.selectorType).toBe('css')
  })

  it('should use id when no data-testid', () => {
    const result = buildSelector({
      tag: 'input',
      attrs: { id: 'username' },
      indexAmongSiblings: 0,
    })
    expect(result.selector).toBe('#username')
  })

  it('should use nth-child for fallback', () => {
    const result = buildSelector({
      tag: 'button',
      attrs: {},
      indexAmongSiblings: 2,
    })
    expect(result.selector).toBe('button:nth-of-type(3)')
  })
})
