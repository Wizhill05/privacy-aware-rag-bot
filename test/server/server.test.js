import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../src/server.js';

test('Express Server and API endpoints work properly', async (t) => {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_MODE = 'mock';

  const { app } = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  t.after(() => {
    server.close();
  });

  await t.test('GET /api/auth/me returns mock user directory', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.authMode, 'mock');
    assert.equal(data.isAuthenticated, true);
    assert.equal(data.user.id, 'user:alice');
    assert.ok(data.availableMockUsers.length >= 4);
  });

  await t.test('POST /api/chat as Alice retrieves salary info', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'What are the 2026 salary bands?' }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.user, 'user:alice');
    assert.ok(data.authorizedCount > 0);
    assert.ok(data.answer.includes('$110,000') || data.answer.includes('Software Engineer'));
  });

  await t.test('POST /api/auth/mock-switch switches user to Bob', async () => {
    const res = await fetch(`${baseUrl}/api/auth/mock-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user:bob' }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.activeUser.id, 'user:bob');
  });

  await t.test('POST /api/chat as Bob denies salary info and prevents leakage', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'What are the 2026 salary bands?' }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.user, 'user:bob');
    assert.equal(data.authorizedCount, 0);
    assert.ok(data.deniedCount > 0);
    assert.ok(data.answer.includes('Access Denied'));
    assert.ok(!data.answer.includes('$110,000'));
  });

  await t.test('GET /api/fga/status returns store status', async () => {
    const res = await fetch(`${baseUrl}/api/fga/status`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.mode, 'in-memory');
    assert.ok(data.indexedDocuments.includes('salary_bands_2026'));
  });
});
