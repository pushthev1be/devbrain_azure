import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'path';

const SERVER_PATH = resolve(
  __dirname,
  '../../../node_modules/@mongodb-js/mongodb-mcp-server/dist/index.js'
);

export interface MongoMcpFindOptions {
  filter?: Record<string, unknown>;
  projection?: Record<string, unknown>;
  limit?: number;
  sort?: Record<string, unknown>;
}

export interface MongoMcpFindResult {
  documents: Record<string, unknown>[];
  summary: string;
}

export async function mongoMcpFind(
  collection: string,
  options: MongoMcpFindOptions = {}
): Promise<MongoMcpFindResult> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_PATH],
    env: {
      ...process.env,
      MDB_MCP_CONNECTION_STRING: uri,
    },
  });

  const client = new Client(
    { name: 'devbrain', version: '0.1.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  try {
    // MongoDB MCP server requires an explicit connect call before any DB operation
    await client.callTool({
      name: 'connect',
      arguments: { connectionStringOrClusterName: uri },
    });

    const result = await client.callTool({
      name: 'find',
      arguments: {
        database: 'devbrain',
        collection,
        limit: options.limit ?? 10,
        ...(options.filter     ? { filter: options.filter }         : {}),
        ...(options.projection ? { projection: options.projection } : {}),
        ...(options.sort       ? { sort: options.sort }             : {}),
      },
    });

    const parts = (result.content as Array<{ type: string; text: string }>) ?? [];
    const summary   = parts[0]?.text ?? '';
    const documents: Record<string, unknown>[] = [];

    for (let i = 1; i < parts.length; i++) {
      try {
        const doc = JSON.parse(parts[i].text) as Record<string, unknown>;
        // strip internal _id and embedding vector to keep output readable
        const { _id, embedding, ...clean } = doc;
        void _id; void embedding;
        documents.push(clean);
      } catch { /* skip malformed */ }
    }

    return { documents, summary };
  } finally {
    await client.close();
  }
}
