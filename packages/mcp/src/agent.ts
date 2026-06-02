import {
  LlmAgent,
  MCPToolset,
  InMemorySessionService,
  Runner,
  isFinalResponse,
} from '@google/adk';

const AGENT_INSTRUCTION = `You are DevBrain, an intelligent developer knowledge assistant.
You have access to a persistent knowledge base of bugs, fixes, decisions, and patterns
accumulated across all projects.

When a developer asks a question:
1. Call search_knowledge with the relevant query to find past entries.
2. If the developer asks to save something, use save_entry with type/title/content.
3. For broad project context, use get_context.
4. Answer concisely, citing specific entries from the knowledge base when relevant.

You are backed by MongoDB Atlas vector search and Google Gemini embeddings.
Always ground your answers in what is actually stored — do not invent knowledge.`;

export async function runAgent(
  query: string,
  mcpUrl: string
): Promise<string> {
  // ADK backend selection:
  // - Cloud Run (K_SERVICE is set): force Vertex AI via service account ADC
  // - Local: use Gemini API key
  const onCloudRun = !!process.env.K_SERVICE;
  if (onCloudRun) {
    process.env.GOOGLE_CLOUD_PROJECT       = process.env.GOOGLE_CLOUD_PROJECT  ?? 'gen-lang-client-0224314788';
    process.env.GOOGLE_CLOUD_LOCATION      = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';
    process.env.GOOGLE_GENAI_USE_VERTEXAI  = 'true';
  } else if (process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY;
  }

  const mcpToolset = new MCPToolset({
    type: 'StreamableHTTPConnectionParams',
    url: mcpUrl,
  });

  // Vertex AI requires explicit version suffix; Gemini API accepts the short name
  const model = onCloudRun ? 'gemini-2.0-flash-001' : 'gemini-2.0-flash';
  const agent = new LlmAgent({
    name: 'devbrain',
    model,
    description: 'Developer knowledge assistant powered by DevBrain and Gemini',
    instruction: AGENT_INSTRUCTION,
    tools: [mcpToolset],
  });

  const runner = new Runner({
    appName: 'devbrain',
    agent,
    sessionService: new InMemorySessionService(),
  });

  const newMessage = {
    role: 'user' as const,
    parts: [{ text: query }],
  };

  let response = '';

  try {
    for await (const event of runner.runEphemeral({ userId: 'devbrain-user', newMessage })) {
      // Collect text from any agent event (final or not) — use the last non-empty one
      if (event.author === 'devbrain' && event.content?.parts) {
        const text = event.content.parts
          .map((p: { text?: string }) => p.text ?? '')
          .join('')
          .trim();
        if (text) response = text;
      }
      // Propagate Gemini errors (rate limit, auth, etc.) so callers get a real error
      if ((event as unknown as Record<string, unknown>).errorCode) {
        const e = event as unknown as { errorCode: number; errorMessage: string };
        throw new Error(`Gemini error ${e.errorCode}: ${e.errorMessage}`);
      }
      // Also honour the explicit final response marker
      if (isFinalResponse(event) && event.content?.parts) {
        const text = event.content.parts
          .map((p: { text?: string }) => p.text ?? '')
          .join('')
          .trim();
        if (text) response = text;
      }
    }
  } finally {
    await mcpToolset.close();
  }

  return response || 'No response generated.';
}
