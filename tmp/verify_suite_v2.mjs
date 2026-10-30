import assert from 'assert'
import { substitutePlaceholders, DEFAULT_DISPATCH_TEMPLATES } from '../applet/lib/templates/dispatchTemplates.ts'

console.log('=== LEXMEDIA CTRL ROOM AUTOMATED VERIFICATION SUITE (V2) ===')

// Test 1: Template substitution engine
console.log('\n[Test 1] Testing Template Substitution Engine...')
const sampleParams = {
  clientName: 'Kofi Mensah',
  clientId: 'LM-C-9821',
  projectName: 'Corporate Video Production',
  invoiceNumber: 'INV-2026-091',
  amount: 'GH₵ 8,500.00',
  paymentStatus: 'Paid',
  loginUrl: 'https://lexmedia.gh/login',
  serviceName: 'Video Editing',
  supportEmail: 'lexmedia8gh@gmail.com',
}

const templateText = 'Hello {{clientName}} (ID: {{clientId}}), your invoice {{invoiceNumber}} for {{projectName}} is {{paymentStatus}} with amount {{amount}}. Portal: {{loginUrl}}'
const substituted = substitutePlaceholders(templateText, sampleParams)

assert.strictEqual(substituted.includes('Kofi Mensah'), true, 'clientName should be substituted')
assert.strictEqual(substituted.includes('LM-C-9821'), true, 'clientId should be substituted')
assert.strictEqual(substituted.includes('INV-2026-091'), true, 'invoiceNumber should be substituted')
assert.strictEqual(substituted.includes('GH₵ 8,500.00'), true, 'amount should be substituted')
assert.strictEqual(substituted.includes('https://lexmedia.gh/login'), true, 'loginUrl should be substituted')
console.log('✓ Template substitution passed:', substituted)

// Test 2: Check DEFAULT_DISPATCH_TEMPLATES coverage
console.log('\n[Test 2] Testing Default Dispatch Templates Schema...')
assert(DEFAULT_DISPATCH_TEMPLATES.length >= 7, 'Must have at least 7 default templates')
for (const tmpl of DEFAULT_DISPATCH_TEMPLATES) {
  assert(tmpl.id, 'Template must have id')
  assert(tmpl.name, 'Template must have name')
  assert(tmpl.category, 'Template must have category')
  assert(tmpl.subject, 'Template must have subject')
  assert(tmpl.body, 'Template must have body')
}
console.log(`✓ All ${DEFAULT_DISPATCH_TEMPLATES.length} dispatch templates validated.`)

console.log('\n=== ALL UNIT TESTS PASSED CLEANLY ===')
