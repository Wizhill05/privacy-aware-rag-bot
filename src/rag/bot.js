import { DocumentIndex } from './index.js';
import { AnswerGenerator } from './generator.js';

export class RagBot {
  /**
   * @param {Object} options
   * @param {DocumentIndex} options.index
   * @param {Object} options.fgaClient - FgaClientWrapper instance
   * @param {AnswerGenerator} [options.generator]
   */
  constructor({ index, fgaClient, generator }) {
    this.index = index;
    this.fgaClient = fgaClient;
    this.generator = generator || new AnswerGenerator();
  }

  /**
   * Main query pipeline demonstrating post-retrieval pre-LLM FGA authorization gate.
   *
   * Step 1: Query retrieval engine (BM25) over full internal document index.
   * Step 2: Post-retrieval candidates evaluated against Auth0 FGA can_view relation.
   * Step 3: Denied candidates are strictly purged before reaching answer synthesis.
   * Step 4: Answer generator synthesizes answer solely from verified authorized context.
   *
   * @param {string} user - e.g. "user:alice" or "user:bob"
   * @param {string} query - User question
   * @param {Object} [options]
   * @param {number} [options.topK=5]
   * @returns {Promise<Object>}
   */
  async ask(user, query, options = {}) {
    const topK = options.topK || 5;

    // STEP 1: Candidate Retrieval (BM25)
    const rawCandidates = this.index.search(query, topK);

    if (rawCandidates.length === 0) {
      return {
        query,
        user,
        retrievedCount: 0,
        authorizedCount: 0,
        deniedCount: 0,
        allowedDocuments: [],
        deniedDocuments: [],
        auditLog: [],
        answer: "No relevant documents were found matching your query in the internal index.",
        sources: [],
      };
    }

    const candidateDocIds = rawCandidates.map((c) => c.id);

    // STEP 2: Post-Retrieval Authorization Gate via Auth0 FGA
    const { allowedDocIds, auditLog } = await this.fgaClient.filterAuthorizedDocuments(
      user,
      candidateDocIds,
      'can_view'
    );

    const allowedSet = new Set(allowedDocIds);
    const authorizedCandidates = rawCandidates.filter((c) => allowedSet.has(c.id));
    const deniedCandidates = rawCandidates
      .filter((c) => !allowedSet.has(c.id))
      .map((c) => ({
        id: c.id,
        title: c.title,
        reason: 'Auth0 FGA policy check failed: user does not have can_view relation on document',
      }));

    // STEP 3 & 4: Answer Generation ONLY from authorized documents
    let generated;
    if (authorizedCandidates.length > 0) {
      generated = this.generator.generateAnswer(query, authorizedCandidates);
    } else {
      generated = {
        answer: `Access Denied: You do not have permission to view the documents related to this topic (${candidateDocIds.map((id) => `document:${id}`).join(', ')}). Your request has been logged for security review.`,
        sources: [],
        passages: [],
      };
    }

    return {
      query,
      user,
      retrievedCount: rawCandidates.length,
      authorizedCount: authorizedCandidates.length,
      deniedCount: deniedCandidates.length,
      allowedDocuments: authorizedCandidates.map((c) => ({
        id: c.id,
        title: c.title,
        score: c.score,
      })),
      deniedDocuments: deniedCandidates,
      auditLog,
      answer: generated.answer,
      sources: generated.sources,
      passages: generated.passages,
    };
  }
}
