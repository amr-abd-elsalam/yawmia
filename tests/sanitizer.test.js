// tests/sanitizer.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 5 — Sanitizer Service Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml, sanitizeText, sanitizeFields } from '../server/services/sanitizer.js';

describe('Sanitizer — stripHtml', () => {

  it('S-01: strips <script> tags', () => {
    const input = '<script>alert(1)</script>';
    assert.strictEqual(stripHtml(input), 'alert(1)');
  });

  it('S-02: strips <b>, <i>, <div> tags', () => {
    const input = '<b>bold</b> and <i>italic</i> inside <div>div</div>';
    assert.strictEqual(stripHtml(input), 'bold and italic inside div');
  });

  it('S-03: preserves plain text (no tags)', () => {
    const input = 'مرحباً بالعمال';
    assert.strictEqual(stripHtml(input), 'مرحباً بالعمال');
  });

  it('S-04: handles nested tags', () => {
    const input = '<div><span>text</span></div>';
    assert.strictEqual(stripHtml(input), 'text');
  });

  it('S-05: handles self-closing tags <br/> <img/>', () => {
    const input = 'hello<br/>world<img src="x" onerror="alert(1)"/>';
    assert.strictEqual(stripHtml(input), 'helloworld');
  });

});

describe('Sanitizer — sanitizeText', () => {

  it('S-06: strips HTML and trims', () => {
    const input = '  <b>فرصة عمل</b>  ';
    assert.strictEqual(sanitizeText(input), 'فرصة عمل');
  });

  it('S-07: returns non-string values as-is', () => {
    assert.strictEqual(sanitizeText(42), 42);
    assert.strictEqual(sanitizeText(null), null);
    assert.strictEqual(sanitizeText(undefined), undefined);
    assert.strictEqual(sanitizeText(true), true);
  });

});

describe('Sanitizer — sanitizeFields', () => {

  it('S-08: sanitizes specified keys only', () => {
    const obj = { title: '<b>فرصة</b>', description: '<script>x</script>وصف', wage: 250 };
    const result = sanitizeFields(obj, ['title', 'description']);
    assert.strictEqual(result.title, 'فرصة');
    assert.strictEqual(result.description, 'xوصف');
    assert.strictEqual(result.wage, 250);
  });

  it('S-09: leaves unspecified keys untouched', () => {
    const obj = { name: '<i>أحمد</i>', phone: '01012345678', active: true };
    const result = sanitizeFields(obj, ['name']);
    assert.strictEqual(result.name, 'أحمد');
    assert.strictEqual(result.phone, '01012345678');
    assert.strictEqual(result.active, true);
  });

  it('S-10: handles null/undefined obj', () => {
    assert.strictEqual(sanitizeFields(null, ['name']), null);
    assert.strictEqual(sanitizeFields(undefined, ['name']), undefined);
  });

});
