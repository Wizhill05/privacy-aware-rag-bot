import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DocumentIndex } from '../../src/rag/index.js';
import { AnswerGenerator } from '../../src/rag/generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_DIR = path.resolve(__dirname, '../../data/documents');

test('DocumentIndex loads documents and performs BM25 retrieval', async (t) => {
  const index = new DocumentIndex();
  index.loadFromDirectory(DOCS_DIR);

  assert.equal(index.getAllDocumentIds().length, 4);

  await t.test('Retrieves salary bands for compensation query', () => {
    const results = index.search('What are the salary bands for software engineers?');
    assert.ok(results.length > 0);
    assert.equal(results[0].id, 'salary_bands_2026');
  });

  await t.test('Retrieves handbook for vacation policy query', () => {
    const results = index.search('How many days of paid vacation do employees get?');
    assert.ok(results.length > 0);
    assert.equal(results[0].id, 'employee_handbook');
  });

  await t.test('Retrieves budget document for Q4 spending query', () => {
    const results = index.search('What is the Q4 operating budget breakdown?');
    assert.ok(results.length > 0);
    assert.equal(results[0].id, 'budget_q4_2026');
  });
});

test('AnswerGenerator quotes retrieved context faithfully', () => {
  const generator = new AnswerGenerator();
  const sampleDocs = [
    {
      id: 'employee_handbook',
      title: 'Acme Global Employee Handbook',
      content: '# Acme Global Employee Handbook\n\nEmployees receive 25 business days of paid annual vacation leave and 12 days sick leave.',
      score: 1.5,
    },
  ];

  const res = generator.generateAnswer('How many vacation days do we get?', sampleDocs);
  assert.ok(res.answer.includes('25 business days'));
  assert.ok(res.sources.includes('Acme Global Employee Handbook'));
});
