# AI-Powered Two-Stroke Knowledge Database
**Version 2 — updated from gap analysis & interview validation**

---

## 1. Product Idea

The proposed solution is an AI-powered knowledge database for two-stroke engines designed to support real-world engineering workflows. The platform collects, structures, and connects technical knowledge from internal company documents, PDFs, test reports, manuals, books, forums, and undocumented expert knowledge.

The goal is to make fragmented two-stroke engine knowledge easy to access, fast to use, and practical for solving real engineering problems.

Instead of manually searching through books, scattered documents, or unreliable internet sources, users can interact with the system through natural language (text or voice), semantic search, image input, and a contextual knowledge view linked to the active problem.

The system is designed as a daily engineering tool — not just for learning, but for actively solving problems.

---

## 2. Problem

Knowledge about two-stroke engines is highly fragmented and difficult to access efficiently.

Important information is often stored in:

- PDFs
- technical reports
- old manuals
- books
- forums
- cloud folders
- test reports

And not stored at all:

- undocumented expert knowledge
- lost knowledge from retired engineers

Engineers currently follow a slow and inefficient workflow:

1. Search for information in books (time-consuming)
2. Use AI tools (e.g., ChatGPT, Copilot) for ideas
3. Manually validate those ideas using trusted sources (books, experience)
4. Brainstorm with colleagues if no solution is found

This process is repetitive, slow, and heavily dependent on individual experience.

Additionally:

- Engineers often face **new problems**, not previously documented
- Solutions require **hypothesis generation and validation**
- Documentation is often **avoided**, leading to knowledge loss
- Collaboration happens manually and inconsistently
- Existing tools are not trusted without verification

Unlike fields like medicine, mechanical engineering knowledge does not become outdated quickly. Physical and mathematical principles remain valid, but accessing and applying them efficiently is the challenge.

---

## 3. Target Users

The platform is designed for:

- engineers working with two-stroke engines
- technicians and test bench operators
- students and beginners
- mechanics and tuning specialists
- companies with internal test data
- motorsport teams
- small-engine manufacturers
- instructors and experts preserving knowledge

**Note on contribution:** Engineers are both users and contributors, but contribution happens indirectly — via voice capture during existing conversations, AI-assisted transcription, and PowerPoint/report upload. The system must not require intentional documentation effort; it embeds into existing social and workflow moments.

---

## 4. Core Value Proposition

The product acts as an intelligent, fast, and easy-to-use engineering assistant for two-stroke engines.

It helps users:

- quickly generate possible causes for problems
- validate ideas using trusted sources
- reduce time spent searching through books
- structure problem-solving workflows
- access cross-referenced solutions
- preserve and reuse expert knowledge
- collaborate more effectively
- avoid repeated mistakes

The system is not just a knowledge database — it actively supports **engineering thinking** by:

- suggesting hypotheses
- guiding troubleshooting steps
- linking related concepts
- providing structured solution paths
- capturing knowledge automatically during natural work moments

It must be:

- fast
- simple to use
- accessible on mobile devices
- low-cost

---

## 5. Main Features

### 5.1 Intelligent Knowledge Database

The system stores and organizes all available knowledge about two-stroke engines.

Data sources include:

- internal PDFs
- company test reports
- manuals
- technical books
- online articles
- forum discussions
- expert notes
- user-submitted experiences

The system extracts only relevant two-stroke content and structures it into usable knowledge.

---

### 5.2 AI Problem-Solving Assistant

Users interact with the system by describing problems via:

- text input
- voice input
- image upload

Example input:

> "Engine is not starting. 500cc displacement. Spark plugs are working. Electrical system is powered."

The system responds with:

- possible causes (hypothesis list)
- cross-referenced related issues
- suggested troubleshooting steps
- links to manuals, diagrams, and reports
- solution examples

**Already-tried step exclusion — UX pattern:**
Each suggested troubleshooting step can be marked inline:
- ☑ Done
- ✗ Failed
- ~ Partially successful

Marked steps are excluded from re-suggestion in the current session. Status is saved to the problem worksheet (see §5.10).

---

### 5.3 Guided Troubleshooting

The system provides structured guidance similar to a manual:

- step-by-step diagnostic flows
- system-level breakdowns (e.g., electrical system, fuel system)
- linked components and dependencies

Example:

> "Check starter → check wiring → check ignition coil → check spark timing"

Each step carries a status indicator: **Done / Failed / Partially successful**. This persists across sessions for long-running problems.

This helps engineers systematically narrow down problems without repeating checked paths.

---

### 5.4 Semantic Search

Users can search by meaning rather than keywords.

Example:

> "scratches on piston"

The system suggests:

- overheating
- lubrication failure
- cooling issues
- combustion problems
- material defects

This supports hypothesis generation. Input via full sentence is preferred over keywords.

---

### 5.5 Contextual Knowledge View (Simplified Graph)

The platform shows a contextual, problem-linked knowledge structure — not a general-purpose graph to explore.

For the active problem, it visually outlines:

- confirmed causes linked to the current issue
- steps already taken (marked done / failed / partial)
- connected solutions, manuals, and reports

This serves as the visual representation of the problem worksheet (see §5.10). It is not a standalone navigation feature. Engineers see only what is relevant to their current problem.

---

### 5.6 Source Transparency, Validation & Reliability

Every piece of information includes:

- source reference
- author (if applicable)
- origin (internal, external, expert)
- reliability indicator (see below)

**Reliability tiers:**

| Tier | Criteria |
|------|----------|
| High | Scientific paper, technical book, validated internal manual |
| Medium | Expert-flagged content (via expert user rating system — see below) |
| Low | Forum post, unverified user note |

**Expert user rating:**
Designated expert users can flag content as validated. Expert status is determined by platform role (assigned by company admins). Expert flags elevate content reliability tier.

**Incorrect information flow:**
- Any user can flag content as "incorrect"
- The author receives a notification
- The flagging user can attach their own input or correction
- Discussion can happen virtually within the platform, without requiring physical contact

---

### 5.7 AI-Assisted Documentation Capture

The system reduces documentation effort by embedding into existing work moments — not by creating a new documentation task.

**Core interaction model:**
The trigger is an existing social moment: engineer explains a solved problem to a colleague. At that point, they press record. The system captures the explanation, transcribes it, structures it, and stores it automatically.

Supported capture modes:
- voice recording during colleague explanation (primary)
- quick notes during troubleshooting
- automatic transcription and structuring
- upload of presentations or reports (e.g., PowerPoint summaries)

Example workflow:

1. Engineer explains solution to colleague verbally
2. Presses record button on mobile
3. System transcribes and structures the explanation
4. Knowledge is stored automatically — no additional effort

This solves the documentation avoidance problem by removing the documentation step entirely from the engineer's perspective.

---

### 5.8 Image-Based Input & Output

**Core MVP feature** (not optional).

Users can:

- upload images of issues (e.g., piston damage, scratches)
- mark problem zones on uploaded images
- receive visual output (diagrams, component locations to inspect)

Images are a confirmed primary input mode. Engineers routinely use pictures to describe and explain problems; the system must support this natively.

---

### 5.9 Mobile-First Design

The system is designed for engineers working in the field:

- accessible on mobile devices
- quick interaction (voice, text, image)
- minimal friction

Ease of use is critical for adoption. Complex UI or high license costs are named kill conditions for the project.

---

### 5.10 Session Continuity / Problem Worksheets

Engineers work on problems that span days, weeks, or months. The system saves each problem as a persistent worksheet.

**Worksheet contains:**
- problem description (initial input)
- generated hypotheses and causes
- troubleshooting steps with status: ☑ Done / ✗ Failed / ~ Partial
- solution attempts and outcomes
- captured notes and voice logs
- linked sources and references

**Session status:**
Each worksheet has a top-level status:
- 🔄 In progress
- ✓ Fixed
- ✗ Not fixed
- ⊘ Unsolvable (documented dead ends)

Engineers can resume any open worksheet without re-entering context. Worksheets can be shared with colleagues.

---

### 5.11 Solution Feedback Loop

After attempting a proposed solution, the engineer marks the result directly within the proposition:

- ✓ Works — solution is confirmed
- ✗ Fails — solution did not resolve the issue
- ~ Partial — issue partially resolved

This feedback is stored in the problem worksheet and used to:
- update the worksheet status
- suppress already-failed paths from re-suggestion
- capture knowledge signals without requiring separate documentation

Over time, aggregated feedback improves answer quality (data flywheel).

---

## 6. Data Sources

### Internal Sources

- company cloud files
- PDFs
- manuals
- internal test reports
- historical documentation
- expert experience
- user observations

### External Sources

- technical books
- public manuals
- internal forums
- online articles
- research papers

External data is clearly marked and validated. Reliability tier is displayed for every source.

---

## 7. AI Use Cases

The AI component supports:

- problem interpretation
- hypothesis generation
- document summarization
- extraction of relevant content
- semantic search
- guided troubleshooting
- linking related concepts
- automatic tagging
- documentation generation from voice input
- identifying missing knowledge
- reliability classification of sources

---

## 8. Example User Workflow

1. User describes a problem (text, voice, or image)
2. System generates possible causes
3. System suggests troubleshooting steps (with Done / Failed / Partial checkmarks)
4. User tests solutions and marks results inline (✓ Works / ✗ Fails / ~ Partial)
5. System updates worksheet with feedback — knowledge captured automatically
6. Session saved; user resumes next session with full context intact

---

## 9. MVP for the Hackathon

### MVP Core Features

- text and voice problem input
- image upload and problem zone marking *(moved from optional — confirmed core need)*
- basic AI chatbot for troubleshooting
- document upload (PDFs, manuals)
- semantic search
- source referencing with reliability tier display
- already-tried step exclusion (Done / Failed / Partial checkmarks)
- solution feedback (Works / Fails / Partial) on each proposition
- problem worksheet with persistent session state (In Progress / Fixed / Not Fixed / Unsolvable)
- contextual knowledge view (simplified, worksheet-linked)
- basic documentation capture via voice recording
- mobile-first

### Optional MVP Features

- expert user rating and flagging system
- author notification on incorrect flag
- gamification elements (TBC)

### Cost Model

*TBD — to be addressed in separate documentation. License cost is a named kill condition: project viability depends on low per-user cost.*

---

## 10. Technical Concept

The system can be built using a Retrieval-Augmented Generation (RAG) architecture.

**FETCH**

1. Information upload
   - Internal documents
   - Internal images
   - Voice recordings
   - Web extraction
   - Digitalized specialist literature

**PROCESS**

1. Relevant extraction → Textual knowledge
   - Categorizing / clustering / chunking
   - Embedding creation
   - Reliability classification

**STORE**

1. Storage in vector database
2. Problem worksheets stored as persistent sessions

**SOLUTION PROPOSALS**

1. Analyze problem input
2. Prepare solution suggestions (worksheet)
3. Interact with user while solving:
   - receive step feedback (Done / Failed / Partial)
   - receive solution outcome (Works / Fails / Partial)
   - update worksheet with all captured signals
   - trigger voice capture during explanation moments

---

## 11. Differentiation

The solution differs from existing tools by focusing on real engineering workflows.

Key differentiators:

- problem-solving oriented (not just knowledge storage)
- supports hypothesis generation
- integrates validation workflow (AI + trusted sources)
- captures undocumented expert knowledge via ambient voice — no extra documentation effort
- persistent problem worksheets with session continuity
- already-tried step exclusion prevents circular troubleshooting
- solution feedback loop as data flywheel signal
- defined reliability tiers (not vague "trust" indicators)
- author contact and correction flow for incorrect information
- mobile-first design
- transparent source tracking
- low-cost and easy to use

---

## 12. Long-Term Vision

The platform evolves into a complete engineering intelligence system.

It will:

- preserve expert knowledge
- accelerate problem-solving
- improve collaboration
- reduce knowledge loss
- support training of new engineers

Over time, it becomes a central system for:

- troubleshooting
- design validation
- knowledge sharing
- continuous learning

The proprietary dataset, expert correction layer, and solution feedback loop form the core defensibility: a data flywheel that becomes harder to replicate over time.

---

## 13. Possible Product Name Ideas

- StrokeIQ
- TwoStrokeGPT
- EngineMind
- StrokeBase AI
- MotoWiki AI
- PortMap AI
- EngineGraph
- StrokeBrain
- TaktIQ
- TwoStroke Knowledge Hub

---

## 14. One-Sentence Pitch

An AI-powered engineering assistant that helps solve two-stroke engine problems by generating hypotheses, guiding troubleshooting, and connecting validated knowledge from trusted sources — while capturing expert knowledge automatically in the background.

---

## 15. Short Pitch

Engineers waste time searching through books, validating AI suggestions, and manually documenting solutions. Our platform transforms this workflow into a fast, intelligent system. Users describe problems via text, voice, or images, receive structured solution paths with step-by-step tracking, validate ideas with reliability-rated sources, and mark outcomes directly — automatically feeding knowledge back into the system. Problems are saved as persistent worksheets, so engineers never lose context on long-running issues. It acts as both a problem-solving assistant and a self-improving knowledge base for two-stroke engines.
