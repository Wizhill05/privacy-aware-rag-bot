import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAuth } from './auth.js';
import { FgaClientWrapper } from './fga/client.js';
import { DocumentIndex } from './rag/index.js';
import { AnswerGenerator } from './rag/generator.js';
import { RagBot } from './rag/bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Setup Authentication (Auth0 or Mock)
  setupAuth(app);

  // Serve static UI assets
  app.use(express.static(path.resolve(__dirname, '../public')));

  // Initialize RAG & FGA services
  const docsDir = path.resolve(__dirname, '../data/documents');
  const index = new DocumentIndex();
  index.loadFromDirectory(docsDir);

  const fgaClient = new FgaClientWrapper();
  const generator = new AnswerGenerator();
  const bot = new RagBot({ index, fgaClient, generator });

  // RAG Chat Endpoint
  app.post('/api/chat', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Field "query" is required as string.' });
      }

      // Identify user from auth session or default to Alice
      const user = req.user?.id || 'user:alice';
      const result = await bot.ask(user, query);
      return res.json(result);
    } catch (err) {
      console.error('API Error in /api/chat:', err);
      return res.status(500).json({ error: 'Internal server error processing RAG request' });
    }
  });

  // FGA Information Endpoint
  app.get('/api/fga/status', (req, res) => {
    res.json({
      mode: fgaClient.getMode(),
      indexedDocuments: index.getAllDocumentIds(),
    });
  });

  return { app, bot, fgaClient, index };
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution && process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;
  const { app, fgaClient } = createApp();
  app.listen(PORT, () => {
    console.log(`Privacy-Aware RAG Bot listening on http://localhost:${PORT}`);
    console.log(`Auth Mode: ${process.env.AUTH_MODE || 'mock'}`);
    console.log(`Auth0 FGA Mode: ${fgaClient.getMode()}`);
  });
}
