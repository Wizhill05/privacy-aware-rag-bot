# Privacy-Aware RAG Bot (Focus: Auth0 FGA)

A production-ready internal HR Knowledge Assistant demonstrating **Privacy-Aware Retrieval-Augmented Generation (RAG)** enforced with **Auth0 Fine-Grained Authorization (FGA)** / OpenFGA.

---

## 1. What It Does

In traditional RAG pipelines, an index retrieval step fetches the most semantically relevant chunks across a document corpus and injects them directly into the LLM context prompt. If sensitive internal documents (e.g., executive salary bands, departmental budgets, performance ratings) are indexed, unauthorized users can easily prompt-inject or directly ask the bot to reveal confidential details.

**The Privacy-Aware RAG Bot solves this by enforcing an authorization gate between retrieval and answering:**
1. **Candidate Retrieval**: The user query searches the document corpus using an in-memory BM25 retrieval engine.
2. **Post-Retrieval FGA Gate**: Before retrieved candidates reach the answer generator, candidate document IDs are evaluated against Auth0 FGA relation rules (`user:<id> can_view document:<doc_id>`) using `@openfga/sdk` (or the offline evaluator fallback).
3. **Strict Candidate Pruning**: Denied documents are completely purged from the context.
4. **Answer Generation**: The answer generator only ever quotes and synthesizes text from **authorized** documents. If all candidates are denied, the bot returns an explicit access denial response without leaking any sensitive content or numbers.

---

## 2. Authorization Model & Tuples

### Authorization Model (`model.fga`)
```fga
model
  schema 1.1

type user

type department
  relations
    define member: [user]

type role
  relations
    define assignee: [user]

type document
  relations
    define owner: [user]
    define reader: [user, department#member, role#assignee]
    define can_view: owner or reader
```
- A document can be viewed by its `owner` or any `reader`.
- `reader` supports direct users (`user:alice`), whole roles (`role:manager#assignee`), or departments (`department:engineering#member`).
- Both the DSL (`fga/model.fga`) and compiled OpenFGA JSON (`fga/model.json`) are included.

### Seed Tuples (`fga/tuples.json`)
| User / Entity | Relation | Object | Meaning |
|---|---|---|---|
| `user:alice` | `assignee` | `role:manager` | Alice is an Engineering Manager |
| `user:alice` | `member` | `department:engineering` | Alice is in Engineering |
| `user:bob` | `assignee` | `role:employee` | Bob is a Software Engineer |
| `user:bob` | `member` | `department:engineering` | Bob is in Engineering |
| `user:carol` | `assignee` | `role:manager` | Carol is a Finance Manager |
| `user:carol` | `member` | `department:finance` | Carol is in Finance |
| `user:dave` | `assignee` | `role:employee` | Dave is a Marketing Associate |
| `user:dave` | `member` | `department:marketing` | Dave is in Marketing |
| `role:manager#assignee` | `reader` | `document:salary_bands_2026` | Only Managers can view salary bands |
| `role:manager#assignee` | `reader` | `document:budget_q4_2026` | Managers can view Q4 budgets |
| `department:finance#member` | `reader` | `document:budget_q4_2026` | Finance department can view Q4 budgets |
| `role:employee#assignee` | `reader` | `document:employee_handbook` | All employees can view handbook |
| `role:manager#assignee` | `reader` | `document:employee_handbook` | All managers can view handbook |
| `department:engineering#member` | `reader` | `document:engineering_onboarding` | Only Engineering can view eng onboarding |

---

## 3. Auth0 Dashboard Setup Steps

To run the application with live Auth0 Universal Login and Auth0 FGA:

### A. Auth0 Universal Login Setup (SSO)
1. Navigate to the **[Auth0 Dashboard](https://manage.auth0.com)**.
2. Go to **Applications** > **Applications** > Click **Create Application**.
3. Choose **Regular Web Application** and click **Create**.
4. In the application **Settings**:
   - **Allowed Callback URLs**: `http://localhost:3000/callback`
   - **Allowed Logout URLs**: `http://localhost:3000/logout`, `http://localhost:3000/`
   - Copy **Domain** (e.g. `your-tenant.us.auth0.com`), **Client ID**, and **Client Secret**.
5. Put these in your `.env` file as:
   ```env
   AUTH_MODE=auth0
   AUTH0_BASE_URL=http://localhost:3000
   AUTH0_ISSUER_BASE_URL=https://your-tenant.us.auth0.com
   AUTH0_CLIENT_ID=<your-auth0-client-id>
   AUTH0_CLIENT_SECRET=<your-auth0-client-secret>
   SESSION_SECRET=<random-32-char-string>
   ```

### B. Auth0 FGA (Fine-Grained Authorization) Setup
1. In the Auth0 Dashboard, navigate to **Auth0 FGA** (or open [fga.dev](https://fga.dev)).
2. Create a new store named `privacy-aware-rag-store`.
3. Open **Store Settings** and copy your **Store ID**.
4. Create an API Client under **API Credentials** with Write/Read permissions to the store:
   - Note the **Client ID** and **Client Secret**.
5. Put these in your `.env` file:
   ```env
   FGA_API_URL=https://api.us1.fga.dev
   FGA_STORE_ID=<your-fga-store-id>
   FGA_CLIENT_ID=<your-fga-client-id>
   FGA_CLIENT_SECRET=<your-fga-client-secret>
   FGA_API_AUDIENCE=https://api.us1.fga.dev/
   FGA_API_TOKEN_ISSUER=auth.fga.dev
   ```
6. Run the automated seed script to deploy the authorization model and tuples:
   ```bash
   npm run seed:fga
   ```

---

## 4. Environment Variables (`.env.example`)

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | HTTP Server port | `3000` |
| `NODE_ENV` | Runtime environment | `development` |
| `AUTH_MODE` | Authentication mode (`mock` or `auth0`) | `mock` |
| `SESSION_SECRET` | 32+ character session encryption secret | Random string |
| `AUTH0_BASE_URL` | Base URL of this application | `http://localhost:3000` |
| `AUTH0_ISSUER_BASE_URL`| Auth0 tenant domain | `https://your-tenant.us.auth0.com` |
| `AUTH0_CLIENT_ID` | Auth0 Application Client ID | `<auth0-client-id>` |
| `AUTH0_CLIENT_SECRET` | Auth0 Application Client Secret | `<auth0-client-secret>` |
| `FGA_API_URL` | Auth0 FGA API base URL | `https://api.us1.fga.dev` |
| `FGA_STORE_ID` | Auth0 FGA Store ID | `<fga-store-id>` |
| `FGA_CLIENT_ID` | Auth0 FGA API Client ID | `<fga-client-id>` |
| `FGA_CLIENT_SECRET` | Auth0 FGA API Client Secret | `<fga-client-secret>` |
| `FGA_API_AUDIENCE` | Token audience for Auth0 FGA | `https://api.us1.fga.dev/` |
| `FGA_API_TOKEN_ISSUER` | Token issuer for Auth0 FGA | `auth.fga.dev` |

---

## 5. How to Run

### Installation
```bash
npm install
```

### Running in Offline / Demo Mode (No Auth0 Credentials Needed)
```bash
npm start
```
1. Open [http://localhost:3000](http://localhost:3000) in your browser.
2. Use the **Active Identity** dropdown in the top header to instantly switch between:
   - **Alice (Manager, Engineering)**
   - **Bob (Employee, Engineering)**
   - **Carol (Manager, Finance)**
   - **Dave (Employee, Marketing)**
3. Click sample prompt chips or ask queries to observe real-time candidate filtering in the **FGA Authorization Inspector** pane.

### Running with Real Auth0 Services
1. Copy `.env.example` to `.env` and fill in credentials.
2. Set `AUTH_MODE=auth0`.
3. Seed the FGA store:
   ```bash
   npm run seed:fga
   ```
4. Start the server:
   ```bash
   npm start
   ```

---

## 6. How to Run Tests

Run the built-in Node.js 22 test runner:
```bash
npm test
```
All unit and integration tests run offline against the in-memory OpenFGA evaluator:
- **`test/fga/evaluator.test.js`**: Validates OpenFGA relationship resolution, role/department expansions, direct & indirect permissions.
- **`test/rag/rag.test.js`**: Validates document indexing, BM25 retrieval, and quote-only answer synthesis.
- **`test/rag/bot.test.js`**: Proves that Alice can access salary bands while Bob is denied, and verifies zero sensitive data leakage.
- **`test/server/server.test.js`**: End-to-end integration tests on HTTP server, mock switcher, and authorization verification.

---

## 7. How This Meets the Challenge Success Criteria

### 1. Document-Level Access Rules via Auth0 FGA
- Implemented `model.fga` (DSL) and `model.json` defining `document.can_view = owner or reader` with `reader` relationships mapped to roles (`role:manager#assignee`) and departments (`department:engineering#member`).
- Loaded seed tuples (`fga/tuples.json`) associating users (Alice, Bob, Carol, Dave) with their departments and roles.
- Seed script (`scripts/seed-fga.js`) publishes model and tuples to remote Auth0 FGA store using the official `@openfga/sdk`.

### 2. Dual-Engine Architecture (Cloud & Offline Evaluator)
- `src/fga/client.js` (`FgaClientWrapper`) dynamically detects credentials. When `FGA_CLIENT_ID` is present, it delegates to `@openfga/sdk`; otherwise, it seamlessly utilizes `src/fga/evaluator.js` (`InMemoryFgaEvaluator`) implementing OpenFGA graph resolution.

### 3. Post-Retrieval Pre-LLM Authorization Gate
- In `src/rag/bot.js`, the query first searches the document corpus using BM25 (`this.index.search(query)`).
- Before any retrieved text reaches `this.generator.generateAnswer(...)`, candidate document IDs are submitted to `fgaClient.filterAuthorizedDocuments(user, candidateDocIds)`.
- Unauthorized documents are **completely eliminated** from the context array.
- If all retrieved candidates fail the check, the bot returns an explicit `Access Denied` notification and logs the authorization check in `auditLog`.
- As proven in `test/rag/bot.test.js`:
  ```javascript
  // Manager Alice gets the figures:
  assert.ok(aliceRes.answer.includes('$110,000'));
  
  // Employee Bob is denied:
  assert.ok(!bobRes.answer.includes('$110,000'));
  assert.ok(bobRes.answer.includes('Access Denied'));
  ```

### 4. Authentication & Interactive Web UI
- `src/auth.js` wires `express-openid-connect` for real Auth0 Universal Login, with a pluggable mock mode for offline local exploration.
- The web UI (`public/index.html`) includes:
  - An interactive user switcher.
  - A real-time chat interface displaying source citations and denial alerts.
  - A live **FGA Authorization Inspector** showing exact tuple evaluations (`can_view(document:...) -> [ALLOWED] / [DENIED]`).
