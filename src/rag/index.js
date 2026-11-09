import fs from 'node:fs';
import path from 'node:path';

/**
 * Tokenizer & standard English stop-words list.
 */
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any',
  'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did',
  'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each',
  'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t',
  'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself',
  'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if',
  'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more',
  'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same',
  'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some',
  'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re',
  'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very',
  'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t',
  'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who',
  'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you',
  'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves'
]);

export function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * In-memory BM25 retrieval engine for local document index.
 */
export class DocumentIndex {
  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.documents = new Map(); // id -> { id, title, content, tokens, length }
    this.docFreq = new Map();   // token -> number of docs containing token
    this.avgDocLength = 0;
  }

  /**
   * Load all Markdown documents from a directory into the index.
   */
  loadFromDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const id = path.basename(file, '.md');
        const fullPath = path.join(dirPath, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        this.addDocument(id, content);
      }
    }
    this.recomputeStats();
  }

  addDocument(id, content) {
    const lines = content.split('\n');
    let title = id;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        title = trimmed.replace('# ', '').trim();
        break;
      }
    }

    const tokens = tokenize(content);
    this.documents.set(id, {
      id,
      title,
      content,
      tokens,
      length: tokens.length,
    });
  }

  recomputeStats() {
    this.docFreq.clear();
    let totalLength = 0;

    for (const doc of this.documents.values()) {
      totalLength += doc.length;
      const uniqueTokens = new Set(doc.tokens);
      for (const t of uniqueTokens) {
        this.docFreq.set(t, (this.docFreq.get(t) || 0) + 1);
      }
    }

    this.avgDocLength = this.documents.size > 0 ? totalLength / this.documents.size : 0;
  }

  getDocument(id) {
    return this.documents.get(id);
  }

  getAllDocumentIds() {
    return Array.from(this.documents.keys());
  }

  /**
   * Search index using BM25 scoring algorithm.
   * Returns top matching document candidates.
   */
  search(query, topK = 5) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      return [];
    }

    const N = this.documents.size;
    const scores = [];

    for (const [id, doc] of this.documents.entries()) {
      let score = 0;
      const termCounts = new Map();
      for (const t of doc.tokens) {
        termCounts.set(t, (termCounts.get(t) || 0) + 1);
      }

      for (const qTerm of queryTokens) {
        const tf = termCounts.get(qTerm) || 0;
        if (tf === 0) continue;

        const df = this.docFreq.get(qTerm) || 0;
        // Standard BM25 IDF formulation with smoothing
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (doc.length / (this.avgDocLength || 1)));

        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        scores.push({
          id,
          title: doc.title,
          content: doc.content,
          score: Number(score.toFixed(4)),
        });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }
}
