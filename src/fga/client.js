import { OpenFgaClient } from '@openfga/sdk';
import { InMemoryFgaEvaluator } from './evaluator.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_TUPLES_PATH = path.resolve(__dirname, '../../fga/tuples.json');

export class FgaClientWrapper {
  /**
   * @param {Object} options
   * @param {string} [options.apiUrl]
   * @param {string} [options.storeId]
   * @param {string} [options.clientId]
   * @param {string} [options.clientSecret]
   * @param {string} [options.apiAudience]
   * @param {string} [options.apiTokenIssuer]
   * @param {InMemoryFgaEvaluator} [options.evaluator]
   */
  constructor(options = {}) {
    const {
      apiUrl = process.env.FGA_API_URL,
      storeId = process.env.FGA_STORE_ID,
      clientId = process.env.FGA_CLIENT_ID,
      clientSecret = process.env.FGA_CLIENT_SECRET,
      apiAudience = process.env.FGA_API_AUDIENCE,
      apiTokenIssuer = process.env.FGA_API_TOKEN_ISSUER,
      evaluator,
    } = options;

    const hasRemoteConfig = Boolean(apiUrl && storeId && clientId && clientSecret);

    if (hasRemoteConfig) {
      this.mode = 'remote';
      this.client = new OpenFgaClient({
        apiUrl,
        storeId,
        credentials: {
          method: 'client_credentials',
          config: {
            apiTokenIssuer: apiTokenIssuer || 'auth.fga.dev',
            apiAudience: apiAudience || apiUrl,
            clientId,
            clientSecret,
          },
        },
      });
    } else {
      this.mode = 'in-memory';
      this.evaluator = evaluator || InMemoryFgaEvaluator.fromFile(DEFAULT_TUPLES_PATH);
    }
  }

  getMode() {
    return this.mode;
  }

  /**
   * Check access: can user perform relation on object?
   */
  async check({ user, relation, object }) {
    if (this.mode === 'remote') {
      const response = await this.client.check({
        user,
        relation,
        object,
      });
      return { allowed: Boolean(response.allowed) };
    }
    return this.evaluator.check({ user, relation, object });
  }

  /**
   * Batch check candidate objects for a user.
   */
  async batchCheck(checks) {
    if (this.mode === 'remote') {
      if (typeof this.client.batchCheck === 'function') {
        const res = await this.client.batchCheck({
          checks: checks.map((c) => ({
            user: c.user,
            relation: c.relation,
            object: c.object,
          })),
        });
        const resultItems = res.result || [];
        return checks.map((c) => {
          const matched = resultItems.find(
            (r) =>
              r.request?.user === c.user &&
              r.request?.relation === c.relation &&
              r.request?.object === c.object
          );
          return {
            ...c,
            allowed: Boolean(matched ? matched.allowed : false),
          };
        });
      }

      // Fallback if batchCheck API isn't present
      const out = [];
      for (const c of checks) {
        const { allowed } = await this.check(c);
        out.push({ ...c, allowed });
      }
      return out;
    }

    return this.evaluator.batchCheck(checks);
  }

  /**
   * List objects of type that user can access.
   */
  async listObjects({ user, relation, type }) {
    if (this.mode === 'remote') {
      const res = await this.client.listObjects({
        user,
        relation,
        type,
      });
      return { objects: res.objects || [] };
    }
    return this.evaluator.listObjects({ user, relation, type });
  }

  /**
   * Filter candidate document IDs against FGA permission.
   * Crucial privacy gate: only authorized documents return.
   *
   * @param {string} user - e.g. "user:bob"
   * @param {Array<string>} docIds - e.g. ["salary_bands_2026", "employee_handbook"]
   * @param {string} [relation="can_view"]
   * @returns {Promise<{ allowedDocIds: Array<string>, auditLog: Array<Object> }>}
   */
  async filterAuthorizedDocuments(user, docIds, relation = 'can_view') {
    if (!docIds || docIds.length === 0) {
      return { allowedDocIds: [], auditLog: [] };
    }

    const checks = docIds.map((id) => ({
      user,
      relation,
      object: id.startsWith('document:') ? id : `document:${id}`,
    }));

    const results = await this.batchCheck(checks);

    const allowedDocIds = [];
    const auditLog = [];

    for (const res of results) {
      const cleanId = res.object.replace(/^document:/, '');
      auditLog.push({
        user: res.user,
        relation: res.relation,
        documentId: cleanId,
        allowed: res.allowed,
      });
      if (res.allowed) {
        allowedDocIds.push(cleanId);
      }
    }

    return { allowedDocIds, auditLog };
  }
}
