import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DocumentIndex } from '../../src/rag/index.js';
import { AnswerGenerator } from '../../src/rag/generator.js';
import { FgaClientWrapper } from '../../src/fga/client.js';
import { InMemoryFgaEvaluator } from '../../src/fga/evaluator.js';
import { RagBot } from '../../src/rag/bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_DIR = path.resolve(__dirname, '../../data/documents');
const TUPLES_PATH = path.resolve(__dirname, '../../fga/tuples.json');

test('Privacy Gate: FGA filters retrieved candidates BEFORE answer synthesis', async (t) => {
  const index = new DocumentIndex();
  index.loadFromDirectory(DOCS_DIR);

  const evaluator = InMemoryFgaEvaluator.fromFile(TUPLES_PATH);
  const fgaClient = new FgaClientWrapper({ evaluator });
  const generator = new AnswerGenerator();
  const bot = new RagBot({ index, fgaClient, generator });

  await t.test('Manager Alice CAN access salary document and receive compensation figures', async () => {
    const query = 'What are the 2026 salary bands and compensation for software engineers?';
    const result = await bot.ask('user:alice', query);

    assert.equal(result.user, 'user:alice');
    assert.ok(result.retrievedCount > 0, 'Document was found in retrieval index');
    assert.ok(result.authorizedCount > 0, 'Alice was authorized by FGA');
    assert.equal(result.deniedCount, 0, 'Alice has no denied candidate documents');
    assert.ok(result.allowedDocuments.some((d) => d.id === 'salary_bands_2026'));
    
    // Check that salary figures are present in the answer
    assert.ok(result.answer.includes('$110,000') || result.answer.includes('Software Engineer'));
    assert.ok(!result.answer.includes('Access Denied'));
  });

  await t.test('Employee Bob CANNOT access salary document; candidate is filtered before answering', async () => {
    const query = 'What are the 2026 salary bands and compensation for software engineers?';
    const result = await bot.ask('user:bob', query);

    assert.equal(result.user, 'user:bob');
    assert.ok(result.retrievedCount > 0, 'Document WAS found in BM25 retrieval index');
    assert.equal(result.authorizedCount, 0, 'Bob was NOT authorized to view the salary document');
    assert.ok(result.deniedCount > 0, 'Salary document was recorded as denied candidate');
    assert.ok(result.deniedDocuments.some((d) => d.id === 'salary_bands_2026'));

    // Check that sensitive salary numbers NEVER appear anywhere in Bob's answer or passages
    assert.ok(!result.answer.includes('$110,000'), 'Bob answer must not leak L1 salary');
    assert.ok(!result.answer.includes('$180,000'), 'Bob answer must not leak L3 salary');
    assert.ok(!result.answer.includes('Software Engineer I (L1)'));
    assert.ok(result.answer.includes('Access Denied'), 'Bob must receive an explicit Access Denied response');
    assert.equal(result.passages.length, 0, 'No unauthorized passages sent to answer generator');
  });

  await t.test('Both Alice and Bob can view general company policies (handbook)', async () => {
    const query = 'What is the vacation and PTO policy?';
    const aliceRes = await bot.ask('user:alice', query);
    const bobRes = await bot.ask('user:bob', query);

    assert.ok(aliceRes.authorizedCount > 0);
    assert.ok(bobRes.authorizedCount > 0);
    assert.ok(aliceRes.answer.includes('25 business days'));
    assert.ok(bobRes.answer.includes('25 business days'));
  });

  await t.test('Engineering onboarding is accessible to engineer Bob but denied to marketing Dave', async () => {
    const query = 'What is the GitHub setup checklist for new engineers?';
    const bobRes = await bot.ask('user:bob', query);
    const daveRes = await bot.ask('user:dave', query);

    // Bob is in engineering department -> allowed and gets GitHub checklist
    assert.ok(bobRes.authorizedCount > 0);
    assert.ok(bobRes.allowedDocuments.some((d) => d.id === 'engineering_onboarding'));
    assert.ok(bobRes.answer.includes('github.com/acme-corp'));

    // Dave is in marketing department -> engineering_onboarding candidate is DENIED
    assert.ok(daveRes.deniedCount > 0);
    assert.ok(daveRes.deniedDocuments.some((d) => d.id === 'engineering_onboarding'));
    // Crucial privacy guarantee: Dave never receives engineering checklist information
    assert.ok(!daveRes.answer.includes('github.com/acme-corp'));
    assert.ok(!daveRes.passages.some((p) => p.includes('github.com/acme-corp')));
  });
});
