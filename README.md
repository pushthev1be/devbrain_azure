# DevBrain

Persistent developer memory for you and your AI agents. Captures technical knowledge from git commits, lets you save typed notes instantly, and injects ranked context into Gemini and other MCP-compliant agents before they start work — so they already know what broke before, what was decided, and why.

<img width="923" height="866" alt="image" src="https://github.com/user-attachments/assets/68591649-0049-4e8d-bb72-620ffb604a91" />

---

## How it works

Every project you register gets two things: a git hook that captures knowledge from commits automatically, and an MCP/HTTP server that Google Cloud Agent Builder, Gemini Code Assist, and other MCP clients connect to. When your agent starts a task, it calls `get_context` to load your ranked engineering history. When it fixes a bug, it calls `save_entry`. When you hit a known error pattern, it finds the exact past fix — not just something semantically similar.

The memory compounds. An entry retrieved across multiple projects gets flagged as a cross-project pattern and surfaces in every future context load. An entry retrieved 3+ times gets promoted from `observation` to `confirmed` confidence.

### Collaborative Teamwork & Sibling Updates
DevBrain bridges engineering teams across codebases:
- **The Team Feed**: A real-time web dashboard serves a live visual timeline of technical breakthroughs, bug fixes, and architectural choices across all active repositories in the team.
- **CLI Sibling alerts**: When you load context inside the CLI, DevBrain proactively checks other projects and highlights recent fixes from sibling repositories (e.g. sharing a layout fix from a mobile repo with a web frontend developer), avoiding redundant troubleshooting.

<img width="1836" height="909" alt="Image" src="https://github.com/user-attachments/assets/5e286c59-708e-4a96-bbd1-5d0733dbce46" />
---

## Install

```bash
git clone https://github.com/pushthev1be/devbrain.git
cd devbrain
npm install --ignore-scripts
npm run build --workspace=packages/core
npm run build --workspace=packages/cli
npm run build --workspace=packages/mcp
cd packages/cli && npm link
```

Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com):

```bash
mkdir -p ~/.devbrain
echo "GEMINI_API_KEY=your_key_here" > ~/.devbrain/.env
```

### Running Offline (Mock Mode)

To run DevBrain completely offline for development, testing, or recording demonstrations without requiring an active Gemini API key, enable **Mock Mode** in your environment:
- **Bash / Git Bash**: `export DEVBRAIN_MOCK="true"`
- **PowerShell**: `$env:DEVBRAIN_MOCK="true"`

This intercepts Gemini API calls and returns pre-computed high-fidelity synthetic vectors and technical memory mockups.

### Connect to your AI Agent or MCP Client

To run the MCP server locally using standard stdio transport, add this server block to your client configurations:

```json
{
  "mcpServers": {
    "devbrain": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/devbrain/packages/mcp/dist/index.js"]
    }
  }
}
```

For hosted developer teams, DevBrain is optimized for cloud deployment and supports Streamable HTTP (SSE) transport natively.

---

## Starting a new project

```bash
cd my-project
devbrain /init
```

Registers the project, detects the tech stack, installs the post-commit git hook, and creates `DEV_CONTEXT.md`.

`DEV_CONTEXT.md` provides prompt-level guidelines directing your AI agents (Gemini, Agent Builder, or terminal assistants) to automatically fetch technical history using `get_context` and log new learnings using `save_entry`. From that point on, your agent updates your project memory autonomously as you code.

Run `devbrain /recap` after any coding session to extract and save anything your agent missed.

---

## AI Agent Integration & MCP Tools

Five MCP tools your agent calls automatically:

| Tool | When your agent uses it |
|------|----------------------|
| `get_context` | Start of any non-trivial task — loads ranked engineering history |
| `search_knowledge` | Before debugging — searches by error text + semantic similarity |
| `save_entry` | After fixing bugs, making decisions, finding patterns |
| `query_entries` | Browse by type/category/recency — "show me all auth decisions" |
| `get_project_summary` | Quick count of what's stored for a project |

`DEV_CONTEXT.md` instructs the agent to invoke these tools automatically — you never need to prompt manually.

---

## Interactive REPL

```bash
devbrain
```

```
────────────────────────────────────────────────────────────────────────────────
devbrain  ❯ /
────────────────────────────────────────────────────────────────────────────────
❯ /search       Semantic search across all projects
  /context      Inject ranked context for AI agents
  /browse       Scroll through all saved entries
  /save         Save entry  (bug: fix: stack: decision: anti-pattern: ...)
  /recap        AI-extract + save knowledge from a session
  /prompt       Regenerate agent DEV_CONTEXT.md setup block
  /summary      Project name, stack and recent entries
  /export       Export knowledge to zip file
  /open         Open ~/.devbrain in file explorer
  /init         Register project + install git hook
```

---

## Quick saves

Type a prefix at the prompt — saved immediately, no AI call:

```
bug: JWT token expires in production but not locally
fix: set TOKEN_EXPIRY=86400 in the prod .env
decision: use JSON storage over SQLite — no native compilation on Windows
anti-pattern: never access req.user without auth middleware — silent 401 becomes runtime crash
pattern: always run npm install --ignore-scripts on Windows
stack: React, TypeScript, Vite, TailwindCSS, Node.js
```

Devbrain checks for near-duplicate entries at save time (>86% embedding similarity) and warns before saving a duplicate. For decisions, it checks if you're superseding an existing one and marks the old entry as superseded.

---

## Context output

```
# DevBrain Context — my-project — "auth"

## Cross-Project Patterns
- Missing auth middleware on protected routes [×3 projects]
  archetype: missing guard middleware causes silent runtime failure at request time

## Past Issues & Fixes
• JWT expiry diverges between local and production — set TOKEN_EXPIRY explicitly in prod .env
• Refresh token race condition resolved by serializing concurrent requests

## Architecture Decisions
- Stateless JWT over Redis sessions — stateless, works across microservices without shared cache

## Anti-Patterns (avoid these)
- Never access req.user before requireAuth middleware — fails silently in some Express versions

## Patterns & Lessons
- Always verify TOKEN_EXPIRY is consistent across all environments including Docker

## Tech Stack
React · TypeScript · Node.js · Express · MongoDB

📢 Team Updates (from Sibling Projects)
  • [fix] Fix safe-area overlap and remove backdrop blurs from mobile navigation overlays (oracle-odds-ai · 2d ago)
    → Removed backdrop filters in favor of solid high-opacity backgrounds to resolve rendering overhead and...
  • [fix] Fix z-index nesting trap and mobile contrast issues in React+Tailwind layout (oracle-odds-ai · 2d ago)
    → Resolved layout overlap and modal blocking issues on mobile viewports by moving fixed-overlay modals...
```

Sections with 2+ entries are synthesized by Gemini into bullet-point insights. The MCP `get_context` tool returns this format directly.

---

## Technical Retrieval Ranking

Search uses a two-pass approach: pattern matching on stored `errorPattern` fields first, then semantic cosine similarity on embeddings as fallback. This means pasting an exact error message finds the specific past fix even if the wording differs from how it was saved.

**Ranking formula:**
```
semantic × 0.45 + recency × 0.10 + same-project × 0.10 + same-stack × 0.08
  + usage × 0.05 + confidence × 0.05 + category-match × 0.07
  + pattern-match × 0.05 + cross-project × 0.05
```

The same-project boost only fires when the entry already scores > 0.72 semantically — prevents local noise from outranking better cross-project solutions on a focused query. Without a query (general context load), same-project entries get a higher base score so they rank above entries from unrelated projects.

---

## Knowledge Fields

Every entry stores:

| Field | Purpose |
|-------|---------|
| `type` | `bug` `fix` `decision` `pattern` `lesson` `anti-pattern` `stack` `note` `solution` |
| `category` | `auth` `database` `deployment` `build` `config` `network` `performance` `ui` `data` `testing` `security` `other` |
| `errorPattern` | Exact error text — enables direct pattern matching, bypasses semantic threshold |
| `causeArchetype` | Abstract root cause transferable across projects — e.g. "missing guard middleware causes silent runtime failure" |
| `confidence` | `observation` → `corroborated` (retrieved 2×) → `confirmed` (retrieved 3×) |
| `seenInProjects` | Project IDs that have retrieved this entry — 2+ triggers cross-project promotion |
| `supersededBy` | ID of replacement entry — superseded decisions shown separately, not in main context |

---

## Auto-capture from git

After `devbrain /init`, a post-commit hook runs after every commit. Gemini extracts the problem, solution, tags, category, error pattern, and cause archetype from the diff and commit message. If rate-limited, the commit is left unprocessed and retried next time — no knowledge is lost.

---

## Engineering & Architectural Decisions

**MongoDB Atlas for Cloud Scaling & Stored Vectors** — Employs a robust hosted MongoDB Atlas database for technical vector searches. High-dimensional technical embeddings (3072 dimensions) are matched against vector cosine similarity indexes directly in the cloud. Local pure JSON storage is maintained for offline development, ensuring absolute platform portability and zero startup friction.

**Gemini 2.0 Flash & High-Dimensional Embeddings** — `gemini-embedding-001` produces 3072-dimension embeddings. Higher dimensionality improves retrieval precision for technical content where subtle semantic differences matter. Gemini 2.0 Flash handles automated knowledge extraction and context synthesis in real-time, providing extremely high-speed processing.

**High-Fidelity Offline Mock Mode (`DEVBRAIN_MOCK=true`)** — Integrates a comprehensive simulation engine that intercepts all Gemini LLM and embedding API calls. When enabled, it dynamically serves realistic mock extractions, classifications, and project recaps. This enables offline development, CI/CD testing, and rate-limit-free video demonstrations without requiring active API keys.

**Stateless SSE HTTP Request Isolation** — Re-architected the MCP SSE server endpoint to dynamically spin up an isolated, fresh MCP `Server` and `StreamableHTTPServerTransport` instance per incoming connection. This eliminates session cross-talk, memory leaks, and state pollution typical of stateless standard HTTP servers handling concurrent agent requests.

**Two-pass retrieval over pure semantic search** — semantic similarity alone misses cases where the user pastes an exact error message that was saved with different surrounding words. Pattern matching on `errorPattern` runs first as a high-precision pass; semantic search runs as the fallback. This is the difference between finding the exact fix vs finding something vaguely related.

**Dual-Transport MCP: stdio and SSE Cloud Run** — DevBrain is built for standard local workflows via stdio transport, and easily scales to team-wide cloud deployments via a containerized SSE HTTP server. Deploying to Google Cloud Run enables instant cross-project access for hosted agent builders (such as Google Cloud Agent Builder) and serves a highly polished, responsive, VS Code-inspired dark theme developer dashboard.

**Monorepo with npm workspaces** — `core` contains all domain logic and is shared between `cli` and `mcp`. This prevents the two surfaces from drifting — a change to search ranking or entry schema is reflected in both automatically.

**Confidence tiers over arbitrary scoring** — `observation → corroborated → confirmed` maps directly to how knowledge actually becomes reliable: it's observed once, then seen to work again, then proven across multiple retrievals.

**Collaborative Cross-Project Feed & CLI alerts** — Implemented a centralized `/api/feed` endpoint and visual timeline dashboard for real-time team collaboration. Sibling project alerts are proactively routed to the CLI output, creating a shared team engineering memory layer that automatically prevents duplicate work across separate development silos.


---

## Stack & Hackathon Compliance

DevBrain was built and developed during the **Microsoft Build AI Hackathon (May 5 - June 30, 2026)**.

### Microsoft AI Stack Integration
DevBrain features a **dual-provider AI backend**, fully supporting both Gemini and the **Microsoft AI Stack**:
- **Azure OpenAI & Azure AI Foundry**: Supports GPT models for automated session recap, knowledge classification, and contextual synthesis.
- **Azure Embeddings**: Supports generating high-dimensional vectors for semantic cosine similarity search.
- To configure Azure AI, set the following environment variables in your `.env` file (stored in `~/.devbrain/.env`):
  ```bash
  AZURE_OPENAI_API_KEY="your_azure_key_here"
  AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/openai/deployments/your-chat-deployment/chat/completions?api-version=2024-02-15-preview"
  AZURE_OPENAI_EMBEDDING_ENDPOINT="https://your-resource.openai.azure.com/openai/deployments/your-embedding-deployment/embeddings?api-version=2024-02-15-preview"
  ```

### Open Source Libraries & APIs Credits
We extend our credits to the following frameworks, libraries, and open-source tools that power DevBrain:
- Runtime: **Node.js**
- Language: **TypeScript**
- AI Models: **Azure OpenAI API** & **Gemini API**
- Database: **MongoDB Atlas** (using vector search index capabilities)
- CLI Engine: **Inquirer** & **Inquirer Autocomplete Prompt**
- MCP Protocol: **Model Context Protocol SDK** (`@modelcontextprotocol/sdk`)
- Workspace: **npm workspaces** monorepo structure

