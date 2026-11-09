import { tokenize } from './index.js';

/**
 * Deterministic Answer Generator for RAG.
 * Extracts the most relevant sentences or paragraphs directly from authorized context.
 * Strict privacy guarantee: guarantees no synthesis outside of verified retrieved context.
 */
export class AnswerGenerator {
  /**
   * Generates an answer from authorized context documents for a given user query.
   *
   * @param {string} query - User question
   * @param {Array<{ id: string, title: string, content: string, score: number }>} authorizedDocs - Context passed FGA gate
   * @returns {{ answer: string, sources: Array<string>, passages: Array<string> }}
   */
  generateAnswer(query, authorizedDocs) {
    if (!authorizedDocs || authorizedDocs.length === 0) {
      return {
        answer: "I could not find any authorized documents to answer your question. If you believe you should have access to this information, please contact HR or your manager.",
        sources: [],
        passages: [],
      };
    }

    const queryTokens = new Set(tokenize(query));
    const extractedPassages = [];

    for (const doc of authorizedDocs) {
      const paragraphs = doc.content
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0 && !p.startsWith('# '));

      // Score paragraphs based on query token overlap
      const scoredParagraphs = paragraphs.map((p) => {
        const pTokens = tokenize(p);
        let matchCount = 0;
        for (const token of pTokens) {
          if (queryTokens.has(token)) {
            matchCount++;
          }
        }
        return {
          docId: doc.id,
          docTitle: doc.title,
          text: p,
          matchCount,
        };
      });

      scoredParagraphs.sort((a, b) => b.matchCount - a.matchCount);

      // Take top matching paragraphs with at least 1 keyword match
      const relevant = scoredParagraphs.filter((p) => p.matchCount > 0).slice(0, 2);
      if (relevant.length > 0) {
        for (const item of relevant) {
          extractedPassages.push(item);
        }
      } else if (paragraphs.length > 0) {
        // Fallback to first paragraph of highest scoring doc
        extractedPassages.push({
          docId: doc.id,
          docTitle: doc.title,
          text: paragraphs[0],
          matchCount: 0,
        });
      }
    }

    // Sort passages by match relevance
    extractedPassages.sort((a, b) => b.matchCount - a.matchCount);
    const topPassages = extractedPassages.slice(0, 3);

    const sources = Array.from(new Set(topPassages.map((p) => p.docTitle || p.docId)));
    const passageTexts = topPassages.map((p) => p.text);

    let answer = `Based on your authorized internal documents (${sources.join(', ')}):\n\n`;
    for (const passage of topPassages) {
      answer += `> ${passage.text.replace(/\n/g, '\n> ')}\n\n`;
    }
    answer = answer.trim();

    return {
      answer,
      sources,
      passages: passageTexts,
    };
  }
}
