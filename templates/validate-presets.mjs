import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

async function load(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}
const catalog = await load('./index.json');
assert.equal(catalog.families.length, 2);
const total = { quotation: 0, 'purchase-order': 0 };
for (const family of catalog.families) {
  const folder = family.id === 'purchase-order' ? 'po' : family.id;
  const manifest = await load('./' + folder + '/index.json');
  assert.equal(manifest.family, family.id);
  assert.equal(manifest.templates.length, family.templateCount);
  const seen = new Set();
  for (const entry of manifest.templates) {
    assert(!seen.has(entry.id), 'duplicate id: ' + entry.id);
    seen.add(entry.id);
    const doc = await load('./' + folder + '/' + entry.path);
    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.family, family.id);
    assert.equal(doc.id, entry.id);
    assert(doc.layout.termsKeepTogether, 'terms must be kept together');
    if (family.id === 'quotation') {
      assert(doc.fields.length >= 15);
      assert.equal(doc.items.rental.initialRows, entry.rentalRows);
      assert.equal(doc.terms.clauses.length, entry.termClauses);
      assert(doc.terms.clauses.every((x, n) => x.number === n + 1));
      assert(!doc.terms.clauses.some(x => /\(30\)\s*\(30\)/.test(x.defaultBody)), 'double day count');
      assert(doc.terms.wordBindings.minDaysWords);
    } else {
      assert.equal(doc.terms.length, 6);
      assert(doc.fields.some(x => x.key === 'poNumber'));
      assert(doc.items.initialRows > 0);
      assert(doc.totals.amountInWords);
      if (doc.id === 'rental') assert.equal(doc.items.formula, 'quantity * rentalDays * unitPrice');
      else assert.equal(doc.items.formula, 'quantity * unitPrice');
    }
    total[family.id] += 1;
  }
}
console.log('Validated ' + total.quotation + ' Quotation and ' + total['purchase-order'] + ' Purchase Order templates.');
