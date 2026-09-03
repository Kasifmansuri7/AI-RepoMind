# AI Codebase Assistant — Project Plan

*A RAG + Multi-Agent + MCP powered tool that reads a codebase and lets you chat with it, ask it to explain code, and ask it to find/fix bugs.*

---

## 1. Project Summary

| | |
|---|---|
| **What it is** | A tool that indexes a GitHub repository and lets you ask questions about it, get explanations, and request bug fixes — all grounded in the real code, not hallucinated. |
| **Why it matters** | Combines three in-demand skills in one coherent build: **RAG** (grounded retrieval), **Agents** (multi-step reasoning/orchestration), and **MCP** (Model Context Protocol — plugs directly into Claude Desktop/Code as a native tool). |
| **Core differentiator** | It dogfoods itself (can answer questions about its own source code) and ships a real MCP server — something very few candidates have on their resume yet. |

---

## 2. Problem Statement

General-purpose LLMs (ChatGPT, Claude, etc.) have no knowledge of a private codebase unless you paste code in manually. This project builds a system that:
1. Reads and understands an entire repository ahead of time.
2. Answers questions and proposes fixes grounded in the actual code.
3. Works like a small dev team (plan → code → review) instead of one blind LLM call.
4. Can be used directly inside existing AI tools (Claude Desktop/Code) via MCP, not just a custom UI.

---

## 3. Core Concepts Explained

### RAG (Retrieval-Augmented Generation)
- The repo is parsed and broken into meaningful chunks (functions, classes, doc sections).
- Chunks are embedded (turned into vectors) and stored in a vector database.
- When a question comes in, the most relevant chunks are retrieved and given to the LLM as context — so answers are grounded in real code, not guesses.

### Agents (Multi-step orchestration)
- **Planner agent** — breaks a request into steps (e.g. "look at session handling + token refresh logic").
- **Coder agent** — uses RAG to pull relevant code, writes an answer or a patch.
- **Reviewer agent** — checks the output (style, correctness, tests), loops back to the coder if something's wrong.

### MCP (Model Context Protocol)
- An open protocol (from Anthropic) that lets AI apps like Claude Desktop or Claude Code call external tools directly.
- This project exposes its RAG search and agent functions as MCP **tools**, so you can literally ask Claude Desktop to "use my codebase assistant" and it calls your backend automatically.

---

## 4. High-Level Architecture

```
                 User
                  │
      ┌───────────┴────────────┐
      │                        │
 Claude Desktop/Code      Custom Chat UI (optional)
   (via MCP)                (Next.js)
      │                        │
      └───────────┬────────────┘
                   ▼
             MCP Server
        (exposes callable tools)
                   │
                   ▼
          Agent Orchestrator
        (Planner → Coder → Reviewer)
                   │
                   ▼
              RAG Layer
     (hybrid vector + keyword search)
                   │
                   ▼
         Vector DB + Metadata Store
                   ▲
                   │
          Ingestion Pipeline
   (clone repo → chunk via tree-sitter →
        embed → store)
```

---

## 5. Component Breakdown

### 5.1 Ingestion Pipeline
- Clone or watch a target GitHub repo.
- Parse code with **tree-sitter** (AST-aware chunking — splits by function/class boundaries rather than arbitrary line counts).
- Parse docs/markdown by section.
- Generate embeddings for each chunk (OpenAI `text-embedding-3-small`, or a local model via `sentence-transformers` for a cost-conscious alternative).
- Store chunks + embeddings + metadata (file path, function name, last modified, git blame) in the database.

### 5.2 RAG Layer
- **Hybrid search**: vector similarity (semantic) + keyword/BM25 (exact symbol/function name matches) — code search benefits heavily from exact matches, not just semantic similarity.
- **Re-ranking** step before final context is sent to the LLM, to improve precision.
- This is the layer to go deep on for interview talking points — naive chunking/retrieval is the #1 place these projects fall flat.

### 5.3 Agent Orchestrator (LangGraph)
- Explicit state machine with 3 nodes: `planner`, `coder`, `reviewer`.
- Planner decides what info/files are needed.
- Coder calls the RAG search tool, then generates an answer or patch.
- Reviewer validates the output (and can trigger tests), looping back to the coder on failure.
- LangGraph is recommended over black-box agent frameworks because the explicit graph is easy to diagram and explain in interviews.

### 5.4 MCP Server
- Built with the official MCP SDK (Python or TypeScript).
- Exposes tools such as:
  - `search_codebase(query)`
  - `explain_function(file, function_name)`
  - `propose_fix(issue_description)`
  - `run_tests()`
- Runs as a standalone process that Claude Desktop/Code (or any MCP-compatible client) can connect to.

### 5.5 Backend API (for the optional custom UI)
- FastAPI service exposing a `/chat` endpoint that internally triggers the RAG + agent pipeline.
- Async-friendly, easy to extend with auth/rate limiting later.

### 5.6 Frontend (optional)
- Next.js + Tailwind single-page chat interface.
- Simple message list + input box — calls the FastAPI backend.
- Mainly useful for demo videos/screenshots for people who won't install Claude Desktop to test your MCP server directly.

---

## 6. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend language | Python | Best-supported ecosystem for RAG/agent/MCP tooling |
| Backend framework | FastAPI | Async, clean REST API for the optional frontend |
| Vector DB | Qdrant (Docker) or Postgres + pgvector | Either works; pgvector avoids running two separate databases |
| Metadata store | Postgres | File paths, function names, git info |
| Embeddings | OpenAI `text-embedding-3-small` or `sentence-transformers` (local) | Cloud for simplicity, local to show cost-awareness |
| Chunking | tree-sitter (code), custom/unstructured.io (docs) | AST-aware chunking >> naive line splitting |
| Agent framework | LangGraph | Explicit state machine, easy to explain design decisions |
| MCP | Official MCP SDK (Python or TypeScript) | Standard protocol, plugs into Claude Desktop/Code |
| Frontend (optional) | Next.js + Tailwind | Simple, clean, good for demo recordings |

---

## 7. Suggested Folder Structure

```
ai-codebase-assistant/
├── backend/
│   ├── ingestion/        # repo cloning, chunking, embedding generation
│   ├── rag/               # retrieval logic, hybrid search, reranking
│   ├── agents/            # planner, coder, reviewer nodes (LangGraph)
│   ├── mcp_server/         # MCP tool definitions and server entrypoint
│   ├── api/               # FastAPI routes for optional chat UI
│   └── db/                # vector DB + metadata models/migrations
├── frontend/               # optional Next.js chat UI
├── scripts/                # CLI helpers (e.g. run ingestion on a repo)
├── tests/
├── docs/
│   └── architecture-diagram.png
└── README.md
```

---

## 8. End-to-End Data Flow

1. Run the ingestion script against a target repo → chunks + embeddings stored in the DB.
2. User asks a question — either through Claude Desktop (via MCP) or the optional custom chat UI.
3. Request hits the MCP server directly, or FastAPI → which calls the MCP tool internally.
4. **Planner** agent decides what's needed to answer the request.
5. **Coder** agent calls the RAG search tool to pull real code context.
6. Coder generates an answer or code patch using that context.
7. **Reviewer** agent checks the output, optionally runs tests, loops back to the coder if it fails.
8. Final answer/patch is returned to the user.

---

## 9. Build Roadmap (4 Weeks, Demo-able at Every Stage)

### Week 1 — RAG Foundation
- Build the ingestion pipeline (clone repo → tree-sitter chunking → embeddings → vector DB).
- Build a basic retrieval function and a simple CLI or script to test queries.
- **Milestone:** you can ask a question about a repo and get back real, relevant code chunks.

### Week 2 — MCP Integration
- Wrap the RAG search as an MCP tool.
- Stand up the MCP server and connect it to Claude Desktop.
- **Milestone:** you can ask Claude Desktop to use your tool to answer questions about a real repo.

### Week 3 — Agent Layer
- Build the LangGraph state machine: planner → coder → reviewer.
- Wire the coder node to call the RAG tool for context.
- Add a review/retry loop.
- **Milestone:** you can ask for a bug fix and watch the system plan, write, and self-check the fix.

### Week 4 — Polish & Presentation
- (Optional) Build the simple Next.js chat UI.
- Write a strong README with an architecture diagram.
- Record a short demo video/GIF.
- Deploy a hosted demo if possible (even a limited public repo demo).

---

## 10. What Makes This Project Stand Out

1. **Dogfooding** — it can answer questions about its own source code, which makes for a very strong live demo.
2. **MCP is genuinely new** — very few candidates have shipped a real MCP server; it's a differentiator interviewers will want to ask about.
3. **Hard retrieval problem, not a toy one** — code retrieval requires AST-aware chunking and hybrid search, which is a legitimate, discussable engineering challenge (vs. "I called an embeddings API on some text").
4. **Real multi-agent design** — a planner/coder/reviewer loop with actual retry logic shows agent *design* thinking, not just prompt engineering.
5. **Personally useful** — you'll likely use it on your own repos going forward, which tends to produce better-polished, more enthusiastically explained projects.

**Caveat:** the differentiation depends on going deep on the hard decisions (chunking strategy, retrieval failure handling, agent retry logic) — not just wiring together off-the-shelf libraries with default settings.

---

## 11. Resume Bullet Ideas (fill in real numbers once built)

- Built a full-stack AI codebase assistant combining RAG, multi-agent orchestration (LangGraph), and a custom MCP server integrated with Claude Desktop.
- Implemented AST-aware code chunking with tree-sitter and hybrid (vector + keyword) retrieval, improving relevant-context precision by X%.
- Designed a planner–coder–reviewer agent pipeline with automated retry-on-failure logic for code-fix proposals.
- Shipped an MCP server exposing N tools (search, explain, fix, test), enabling direct integration with Claude Desktop/Code as a native AI tool.
- Reduced repo-onboarding lookup time by X% (or: answered Y% of test questions correctly against ground-truth repo documentation) via a demo evaluation.

---

## 12. Next Steps

- [ ] Pick a target repo to index first (your own project, or a well-known open-source repo)
- [ ] Set up the backend skeleton (FastAPI + Postgres/pgvector or Qdrant via Docker)
- [ ] Build ingestion script (Week 1 milestone)
- [ ] Build MCP server wrapper (Week 2 milestone)
- [ ] Build LangGraph agent loop (Week 3 milestone)
- [ ] Polish, document, demo (Week 4 milestone)
