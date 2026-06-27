# Architecture — AI-Powered Two-Stroke Knowledge Database

---

## 1. Technical Constraints

Derived from PRD and interview. Hard constraints drive stack decisions.

| Constraint | Source | Impact |
|---|---|---|
| Mobile-first | Field use, test bench access | Frontend must run on phone browser or native app |
| Low cost | Named kill condition (>€20k/year ends project) | Self-hostable components preferred; avoid SaaS per-seat pricing |
| Simple UI | Complex UI = no adoption | Minimal frontend surface; no admin-heavy setup |
| Voice input | Primary capture mode for documentation | STT pipeline required |
| Image input/output | Confirmed core feature | Multimodal LLM required |
| Full-sentence natural language | Preferred over keyword search | LLM-based query interpretation, not keyword matching |
| Source traceability | Trust requirement | Every chunk must carry metadata: source, author, reliability tier |
| Persistent problem sessions | Long-running problems span days/months | Stateful session storage required |
| Async collaboration | Colleagues contribute on worksheets independently | Real-time or near-real-time sync on shared worksheets |

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────┐
│              Client Layer                    │
│         PWA (Next.js / mobile browser)      │
│   Text · Voice · Image · Worksheet UI       │
└──────────────────┬──────────────────────────┘
                   │ HTTPS / WebSocket
┌──────────────────▼──────────────────────────┐
│              API Layer                       │
│            FastAPI (Python)                  │
│  Auth · Problem API · Search · Capture API  │
└──────┬───────────┬──────────────┬───────────┘
       │           │              │
┌──────▼──┐  ┌────▼─────┐  ┌────▼────────────┐
│PostgreSQL│  │  Qdrant  │  │   File Storage  │
│Worksheets│  │Vector DB │  │  S3 / R2        │
│Users     │  │Embeddings│  │PDFs·Images·Audio│
│Sessions  │  │Chunks    │  └────────────────-┘
└─────────┘  └────┬─────┘
                  │
┌─────────────────▼───────────────────────────┐
│              AI / RAG Layer                  │
│           LangChain / LlamaIndex             │
│  Retrieval · Reranking · Prompt Assembly    │
└──────────────────┬──────────────────────────┘
                   │
       ┌───────────┼───────────┐
┌──────▼──┐  ┌────▼─────┐  ┌──▼─────────┐
│   LLM   │  │ Whisper  │  │ Embedding  │
│GPT-4o / │  │  (STT)   │  │ Model      │
│ Claude  │  └──────────┘  └────────────┘
└─────────┘
```

---

## 3. Tech Stack

### 3.1 Frontend

| Layer | Technology | Rationale |
|---|---|---|
| Framework | **Next.js 14 (PWA)** | Mobile browser, no app store, fast to build |
| Styling | **Tailwind CSS** | Rapid UI, consistent mobile layout |
| State | **Zustand** | Lightweight, no Redux overhead |
| Real-time | **Supabase Realtime** | Worksheet collaboration sync |
| Voice capture | **MediaRecorder API** (browser native) | No SDK required |
| Image markup | **Fabric.js** or native canvas | Problem zone marking on uploaded images |

PWA preferred over React Native for hackathon. Enables same codebase on mobile browser without app store submission.

---

### 3.2 Backend

| Layer | Technology | Rationale |
|---|---|---|
| Framework | **FastAPI (Python)** | Async, fast to build, native LangChain/LlamaIndex integration |
| Auth | **Supabase Auth** | Free tier, includes JWT, row-level security |
| Session/cache | **Redis** | Session state, query caching |
| Task queue | **Celery + Redis** | Async document ingestion, voice transcription jobs |

---

### 3.3 Data Layer

| Component | Technology | Rationale |
|---|---|---|
| Relational DB | **PostgreSQL (Supabase)** | Worksheets, users, sessions, collaboration, source metadata |
| Vector DB | **Qdrant** (self-hosted or cloud free tier) | Open-source, self-hostable, strong filtering on metadata |
| File storage | **Cloudflare R2** | S3-compatible, cheaper than AWS ($0.015/GB vs $0.023/GB) |

**PostgreSQL schema (core tables):**
- `users` — id, name, role, expert_flag
- `worksheets` — id, user_id, problem_description, status, created_at
- `worksheet_steps` — id, worksheet_id, hypothesis, status (done/failed/partial), source_ref
- `collaborators` — worksheet_id, user_id, role (viewer/advisor)
- `knowledge_chunks` — id, source_id, content, reliability_tier, author, embedding_id
- `sources` — id, title, type, origin (internal/external), reliability_tier

---

### 3.4 AI / RAG Layer

| Component | Technology | Rationale |
|---|---|---|
| RAG orchestration | **LlamaIndex** | Document ingestion, chunking, retrieval pipeline |
| LLM | **GPT-4o** (primary) or **Claude claude-sonnet-4-6** | Multimodal: handles text + image input natively |
| Embeddings | **text-embedding-3-small** (OpenAI) | Cost-efficient, strong performance |
| Voice STT | **OpenAI Whisper** (API or self-hosted) | Transcribes voice recordings; self-hosted for cost control |
| Reranking | **Cohere Rerank** or cross-encoder | Improves relevance of retrieved chunks |

---

### 3.5 Document Ingestion Pipeline

```
Upload (PDF / image / voice / PPT)
        ↓
[File Storage: R2]
        ↓
[Celery worker triggered]
        ↓
Parse → LlamaIndex
  PDF:   PyMuPDF → text + image extraction
  Voice: Whisper → transcript
  PPT:   python-pptx → slide text
  Image: GPT-4o vision → description
        ↓
Chunk + metadata tagging
  (source, author, reliability tier, date)
        ↓
Embed → text-embedding-3-small
        ↓
Store → Qdrant (vector + payload metadata)
Store → PostgreSQL (source record)
```

---

### 3.6 Query / RAG Pipeline

```
User input (text / voice / image)
        ↓
Normalize:
  Voice → Whisper → text
  Image → GPT-4o vision → text description
        ↓
Embed query → text-embedding-3-small
        ↓
Qdrant similarity search
  Filter: reliability_tier, source type
  Top-k: 8–12 chunks
        ↓
Cohere Rerank → top 4–6 chunks
        ↓
Prompt assembly:
  System prompt (domain: two-stroke engines)
  Retrieved context (chunks + source refs)
  Worksheet state (steps tried, outcomes)
  User query
        ↓
LLM (GPT-4o / Claude)
        ↓
Structured response:
  Hypothesis list (collapsed cards)
  Each card: title + detail + source ref + reliability tier
        ↓
Store → worksheet (hypotheses, steps)
```

---

## 4. Collaboration Architecture

Worksheet sharing uses Supabase Realtime for live sync.

```
Engineer A (worksheet owner)
        ↓
Invites Engineer B (collaborator role)
        ↓
Supabase Realtime channel: worksheet:{id}
  Both clients subscribe
        ↓
Engineer B adds comment on step
        ↓
Optimistic update on B's client
PostgreSQL write → Realtime broadcast → Engineer A's client updates
```

Read-only share link: JWT-scoped token, no account required, read-only access to worksheet snapshot.

---

## 5. Deployment

### Hackathon (MVP)

| Service | Platform | Cost |
|---|---|---|
| Frontend + API | **Vercel** (Next.js) | Free tier |
| Backend (FastAPI) | **Railway** or **Render** | ~$5–10/month |
| Database + Auth | **Supabase** | Free tier (500MB DB, 1GB storage) |
| Vector DB | **Qdrant Cloud** | Free tier (1GB) |
| File storage | **Cloudflare R2** | Free 10GB, then $0.015/GB |
| LLM | **OpenAI API** | Pay-per-token (~$0.01–0.03/1k tokens) |
| STT | **OpenAI Whisper API** | $0.006/minute |

**Estimated monthly cost (small team, <50 active users):** €20–60/month [Assumption: moderate query volume, ~500 LLM calls/day]

### Production (post-hackathon)

- FastAPI on **Fly.io** or **AWS ECS** (auto-scaling)
- Qdrant self-hosted on dedicated VM (eliminates per-query cost)
- Whisper self-hosted (GPU instance for cost reduction at scale)
- PostgreSQL on **AWS RDS** or **Supabase Pro**
- CDN: **Cloudflare** for file delivery

---

## 6. Security Considerations

| Area | Approach |
|---|---|
| Auth | JWT tokens via Supabase; role-based (user / expert / admin) |
| Data isolation | Row-level security in PostgreSQL — users only see own worksheets unless shared |
| Internal data | Internal sources (PDFs, test reports) never exposed to external users; access-controlled by company admin |
| API keys | Server-side only; never exposed to client |
| Voice data | Transcripts stored encrypted; raw audio deleted after processing [Assumption] |

---

## 7. Open Questions / Decisions Required

| Decision | Options | Recommendation |
|---|---|---|
| LLM provider | OpenAI GPT-4o vs Anthropic Claude | GPT-4o for multimodal maturity; Claude as fallback — decide based on cost at scale |
| Whisper hosting | API vs self-hosted | API for hackathon; self-hosted for production cost control |
| Mobile delivery | PWA vs React Native | PWA for hackathon; evaluate React Native if offline support is needed |
| Qdrant hosting | Cloud free tier vs self-hosted | Cloud for hackathon; self-hosted in production |
| Collaboration real-time | Supabase Realtime vs WebSockets | Supabase Realtime (already in stack) |
| Offline support | None vs service worker caching | Out of scope for MVP [Assumption: field connectivity assumed adequate] |
