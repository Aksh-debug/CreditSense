# CreditSense — AI Loan Underwriting Copilot

An underwriting workbench for credit managers. Upload an applicant's documents →
an LLM **extracts** a structured financial profile → an **agentic assessment**
grounds itself in the lender's credit policy (RAG) and produces a recommendation
with reasoning and findings → a **human approves or declines** (the AI never
auto-decides). Every step is **audit-logged**.

It's a deliberate intersection: real fintech underwriting (FOIR, bureau scores,
banking conduct, KYC) plus a modern, production-shaped LLM/agent layer.

> **Read this whole file before your interviews.** The "Design decisions" and
> "Interview prep" sections exist so you can defend every choice as your own.
> This codebase is your starting point, not a black box — run it, break it,
> extend it, and make the decisions yours.

---

## The 20-second pitch (for a recruiter / your resume)

> Built a full-stack AI underwriting copilot (Next.js, TypeScript, Postgres/pgvector,
> Anthropic Claude). Extracts structured financial profiles from loan documents via
> tool-use, runs a RAG-grounded agentic risk assessment against credit policy with
> streamed reasoning, and keeps a human-in-the-loop decision step with a full audit
> trail and role-based access.

---

## Architecture

```
                 ┌────────────────────────────────────────────────────┐
   Browser  ───► │  Next.js App Router (RSC + client workbench)        │
                 │  /login  /dashboard  /applications/[id]             │
                 └───────────────┬────────────────────────────────────┘
                                 │  (server actions / route handlers)
        ┌────────────────────────┼─────────────────────────────────────┐
        ▼                        ▼                                       ▼
 ┌──────────────┐     ┌────────────────────┐               ┌────────────────────┐
 │ NextAuth     │     │ /api/.../extract    │               │ /api/.../assess     │
 │ (JWT, RBAC)  │     │  Claude tool-use →  │               │  RAG → Claude       │
 └──────────────┘     │  structured profile │               │  (streamed via SSE) │
                      └─────────┬───────────┘               └─────────┬──────────┘
                                │                                     │
                                ▼                                     ▼
                      ┌───────────────────────────────────────────────────────┐
                      │ Postgres + pgvector                                     │
                      │  users · applications · documents · extracted_profile  │
                      │  policy_chunks(embedding vector) · assessments          │
                      │  decisions · audit_log                                  │
                      └───────────────────────────────────────────────────────┘

 Embeddings: Voyage AI (swappable)        LLM: Anthropic Claude (extraction + assessment)
```

The pipeline is a 4-step state machine per application:
`DRAFT → EXTRACTED → ASSESSED → APPROVED | DECLINED`.

---

## Tech stack & why

| Layer | Choice | Why (the interview answer) |
|---|---|---|
| Framework | Next.js 14 App Router + TS | One codebase for UI + API; RSC for data fetch, route handlers for mutations and streaming. |
| DB | Postgres + **pgvector** | Keep relational data and embeddings in **one** store — no separate vector DB to operate for this scale. |
| ORM | Prisma | Type-safe schema; raw SQL where pgvector needs it (`<=>` similarity). |
| Auth | NextAuth (JWT, credentials) | Role baked into the token → cheap RBAC checks with no extra DB hit per request. |
| LLM | Anthropic Claude | Tool-use for guaranteed-shape JSON; streaming for live reasoning. |
| Embeddings | Voyage AI | Anthropic doesn't ship an embeddings API; Voyage is its recommended partner. Swappable behind `src/lib/embeddings.ts`. |

---

## Setup

**Prereqs:** Node 18+, a Postgres database **with the pgvector extension**, an
Anthropic API key, and (for RAG) a Voyage API key.

```bash
# 1. Postgres with pgvector (easiest: Docker)
docker run -d --name creditsense-db -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=creditsense \
  pgvector/pgvector:pg16

# 2. Env
cp .env.example .env        # fill in DATABASE_URL, NEXTAUTH_SECRET, ANTHROPIC_API_KEY, VOYAGE_API_KEY

# 3. Install
npm install

# 4. Schema + seed (creates the vector extension, tables, demo users & policy)
npm run db:push
npm run db:seed

# 5. Run
npm run dev                 # http://localhost:3000
```

**Demo logins** (all password `password123`):
`priya@creditsense.app` (Credit Manager) · `rahul@creditsense.app` (RCU) · `admin@creditsense.app` (Admin)

**Try it:** log in → open the seeded "Anjali Mehta" application → *Attach sample
documents* → *Extract with AI* → *Run assessment* (watch it stream) → approve/decline.

> No Voyage key? The seed still runs but policy chunks won't be embedded, so RAG
> returns nothing and the assessment will be ungrounded. Add the key and
> `npm run db:reset` to fix.

---

## The AI pipeline (what to be able to explain)

**1. Extraction (`src/lib/extraction.ts`).** Document text is sent to Claude with a
*forced tool call* (`record_profile`). Forcing the tool guarantees structured JSON
instead of parsing free-form prose. The prompt tells the model to **omit** fields
it can't support from the documents rather than hallucinate them.

**2. Policy RAG (`src/lib/rag.ts` + `embeddings.ts`).** The credit policy is chunked,
embedded, and stored in `policy_chunks.embedding` (a `vector(1024)` column). At
assessment time we embed a query built from the application + profile and retrieve
the top-k chunks by cosine distance (`embedding <=> $1`). Only the retrieved rules
go into the prompt — the model can't invent policy.

**3. Agentic assessment (`src/lib/assessment.ts`).** One streaming call with
`tool_choice: auto` so the model **narrates its reasoning** (streamed to the browser
over SSE), then calls `record_assessment` for the structured recommendation,
confidence, and findings. A fallback forced call converts reasoning to structure if
the model narrates without calling the tool. Citations link findings back to policy
chunks for explainability.

**4. Human-in-the-loop (`/api/.../decision`).** The AI output is advisory. A human
records the binding decision with a mandatory note, and we store whether they
**agreed with or overrode** the AI — a built-in quality signal you could later use
to measure and improve the model.

---

## Design decisions & trade-offs (interview gold)

- **Forced tool-use over JSON-mode/regex parsing.** Schema-validated, no brittle
  string parsing. Trade-off: one extra concept (tools) vs. far fewer parse failures.
- **`tool_choice: auto` + fallback, not forced, for assessment.** Forcing the tool
  up front suppresses visible reasoning; auto lets it think *then* emit structure.
  The fallback keeps it robust. This is the single subtlest decision — own it.
- **pgvector over a dedicated vector DB (Pinecone/Weaviate).** At this scale, one
  database is simpler to run and keeps embeddings transactionally consistent with
  the data. I'd revisit at millions of vectors or multi-tenant isolation needs.
- **Embeddings behind an interface.** Provider is swappable; the 1024-dim contract
  is the only coupling. Shows you think about vendor lock-in.
- **RBAC in the JWT.** Credit managers see only their queue; RCU/Admin see all.
  Role in the token avoids a DB lookup on every request.
- **Append-only audit log + "agreed with AI" flag.** Lending is regulated;
  explainability and traceability are features, not nice-to-haves.
- **The AI never auto-approves.** A deliberate product/safety choice — the model
  advises, the human is accountable.

### Honest limitations (say these before they ask)
- Documents are pasted text, not real PDF parsing/OCR — the extraction *interface*
  is real; the ingestion is stubbed. Next step: file upload + a parsing pipeline.
- No automated tests yet (see "How to extend").
- Single-DB, single-tenant; no rate limiting on the LLM routes.
- pgvector exact search is fine here; at scale you'd add an HNSW index.

---

## Likely interview questions (and how to answer)

- **"Walk me through what happens when a user clicks *Run assessment*."**
  → route handler authenticates → loads extracted profile → builds a RAG query →
  retrieves policy via cosine similarity → streams Claude's reasoning over SSE →
  parses the forced/auto tool call → upserts the assessment → updates status →
  audit-logs → the client renders reasoning live and then the structured findings.
- **"Why pgvector and not Pinecone?"** → see decisions above; lead with operational
  simplicity and transactional consistency, then name when you'd switch.
- **"How do you stop the model hallucinating policy?"** → retrieval grounds it; only
  retrieved chunks are in context; findings cite chunk titles; the human decides.
- **"How would you scale this to 10k applications/day?"** → queue the LLM work
  (BullMQ/SQS) instead of inline, add an HNSW index, cache embeddings, add rate
  limiting and retries/backoff, move docs to object storage, read replicas.
- **"How do you know the AI is any good?"** → the `agreedWithAi` flag is a labeled
  feedback loop; track agreement rate, build an eval set, measure precision on
  declines.
- **"Why streaming?"** → underwriting is a judgment task; showing the reasoning as
  it forms builds trust and lets the manager catch a wrong turn early.

---

## How to extend (good next commits to make it yours)

1. **Real document ingestion:** file upload → PDF parse/OCR → feed text to extraction.
2. **Tests:** Vitest unit tests for `rag`/`assessment` (mock the LLM), one Playwright
   happy-path E2E. Add a `__tests__` and a CI workflow.
3. **Background jobs:** move extract/assess to a queue; show a "processing" state.
4. **Evals:** a small labeled set + a script that scores recommendations.
5. **Observability:** structured logging + token/cost tracking per assessment.

Doing even one of these and writing the commit message well gives you a concrete
"here's a decision I made and why" story — which is what these interviews reward.

---

## Resume bullet options (pick 2–3, keep your quantified style)

- Built an AI loan-underwriting copilot (Next.js, TypeScript, Postgres/pgvector,
  Anthropic Claude) that extracts structured profiles from documents and produces
  policy-grounded, human-in-the-loop credit recommendations.
- Implemented retrieval-augmented assessment over a credit policy using pgvector
  cosine search, with streamed agent reasoning (SSE) and schema-validated tool-use
  outputs.
- Designed role-based access and an append-only audit trail to meet lending-style
  explainability and traceability requirements.

---

## Project layout

```
prisma/schema.prisma     data model (RBAC, applications, pgvector policy, audit)
prisma/seed.ts           demo users + embedded credit policy + sample application
src/lib/
  anthropic.ts           Claude client
  embeddings.ts          Voyage embeddings behind a swappable interface
  rag.ts                 index + retrieve policy chunks (pgvector)
  extraction.ts          forced tool-use → structured profile
  assessment.ts          streamed reasoning + tool-use recommendation
  auth.ts                NextAuth config + RBAC helpers
src/app/api/...          route handlers (CRUD, extract, assess[SSE], decision)
src/app/(app)/...        authenticated UI (queue + workbench)
src/components/           badges, forms, the underwriting workbench
```
