import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InMemoryFgaEvaluator } from '../../src/fga/evaluator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TUPLES_PATH = path.resolve(__dirname, '../../fga/tuples.json');

test('InMemoryFgaEvaluator evaluates permissions correctly', async (t) => {
  const evaluator = InMemoryFgaEvaluator.fromFile(TUPLES_PATH);

  await t.test('Manager Alice can view salary bands', async () => {
    const res = await evaluator.check({
      user: 'user:alice',
      relation: 'can_view',
      object: 'document:salary_bands_2026',
    });
    assert.equal(res.allowed, true);
  });

  await t.test('Employee Bob CANNOT view salary bands', async () => {
    const res = await evaluator.check({
      user: 'user:bob',
      relation: 'can_view',
      object: 'document:salary_bands_2026',
    });
    assert.equal(res.allowed, false);
  });

  await t.test('Both Alice and Bob can view employee handbook', async () => {
    const aliceRes = await evaluator.check({
      user: 'user:alice',
      relation: 'can_view',
      object: 'document:employee_handbook',
    });
    const bobRes = await evaluator.check({
      user: 'user:bob',
      relation: 'can_view',
      object: 'document:employee_handbook',
    });
    assert.equal(aliceRes.allowed, true);
    assert.equal(bobRes.allowed, true);
  });

  await t.test('Engineering members can view engineering onboarding', async () => {
    const bobRes = await evaluator.check({
      user: 'user:bob',
      relation: 'can_view',
      object: 'document:engineering_onboarding',
    });
    // Dave is marketing employee
    const daveRes = await evaluator.check({
      user: 'user:dave',
      relation: 'can_view',
      object: 'document:engineering_onboarding',
    });
    assert.equal(bobRes.allowed, true);
    assert.equal(daveRes.allowed, false);
  });

  await t.test('batchCheck returns correct list of permissions', async () => {
    const batch = await evaluator.batchCheck([
      { user: 'user:bob', relation: 'can_view', object: 'document:salary_bands_2026' },
      { user: 'user:bob', relation: 'can_view', object: 'document:employee_handbook' },
    ]);
    assert.equal(batch.length, 2);
    assert.equal(batch[0].allowed, false);
    assert.equal(batch[1].allowed, true);
  });
});
