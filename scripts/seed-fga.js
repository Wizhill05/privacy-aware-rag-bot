import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenFgaClient } from '@openfga/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log('--- Auth0 FGA / OpenFGA Seeding Tool ---');

  const apiUrl = process.env.FGA_API_URL;
  const storeId = process.env.FGA_STORE_ID;
  const clientId = process.env.FGA_CLIENT_ID;
  const clientSecret = process.env.FGA_CLIENT_SECRET;
  const apiAudience = process.env.FGA_API_AUDIENCE;
  const apiTokenIssuer = process.env.FGA_API_TOKEN_ISSUER;

  if (!apiUrl || !storeId || !clientId || !clientSecret) {
    console.error('Error: Missing required FGA environment variables.');
    console.error('Required: FGA_API_URL, FGA_STORE_ID, FGA_CLIENT_ID, FGA_CLIENT_SECRET');
    console.error('If you want to run offline, the application natively falls back to the in-memory evaluator with fga/tuples.json.');
    process.exit(1);
  }

  const modelPath = path.resolve(__dirname, '../fga/model.json');
  const tuplesPath = path.resolve(__dirname, '../fga/tuples.json');

  console.log(`Reading model from ${modelPath}...`);
  const modelContent = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

  console.log(`Reading seed tuples from ${tuplesPath}...`);
  const tuples = JSON.parse(fs.readFileSync(tuplesPath, 'utf8'));

  const client = new OpenFgaClient({
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

  console.log(`Uploading authorization model to store ${storeId}...`);
  const { authorization_model_id: modelId } = await client.writeAuthorizationModel(modelContent);
  console.log(`Authorization model created with ID: ${modelId}`);

  console.log(`Writing ${tuples.length} relationship tuples...`);
  // OpenFGA write allows batches of writes
  const CHUNK_SIZE = 10;
  for (let i = 0; i < tuples.length; i += CHUNK_SIZE) {
    const chunk = tuples.slice(i, i + CHUNK_SIZE);
    await client.write({
      writes: chunk.map((t) => ({
        user: t.user,
        relation: t.relation,
        object: t.object,
      })),
    });
    console.log(`Wrote tuples ${i + 1} to ${Math.min(i + CHUNK_SIZE, tuples.length)}`);
  }

  console.log('Seeding completed successfully!');
}

run().catch((err) => {
  console.error('Failed to seed FGA store:', err);
  process.exit(1);
});
