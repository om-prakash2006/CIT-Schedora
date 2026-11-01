# CIT Schedora — Phase 6: Gemini AI Architecture

## 1. System Overview

CIT Schedora integrates a shared, production-minded **AI Intelligence Orchestrator** powered by Google Gemini 3.8 Flash (`gemini-3.8-flash`) via the official `@google/genai` TypeScript SDK. The AI architecture provides natural-language request understanding, English/Hindi/Hinglish intent parsing, multi-turn clarification questions, and evidence-grounded decision explanations across Admin, Department Coordinator, Faculty, and Club Representative workflows.

Crucially, the AI Orchestrator is **strictly decoupled** from deterministic timetabling, examination scheduling, and venue booking allocation. The LLM acts solely as a natural-language interface and explanation service; it never directly mutates institutional database records or bypasses solver constraints.

## 2. Shared AI Orchestrator Diagram

```
                               ┌────────────────────────────────┐
                               │  Authenticated Client (React)  │
                               │  English / Hindi / Hinglish    │
                               └──────────────┬─────────────────┘
                                              │
                                              ▼
                               ┌────────────────────────────────┐
                               │     Express API /api/v1/ai/    │
                               │   Session & Role Verification  │
                               └──────────────┬─────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                             Shared AI Orchestrator (Node.js)                                │
│                                                                                             │
│  - gemini-client.ts: GoogleGenAI client singleton, env.geminiApiKey isolation               │
│  - venue-parser.ts: Multilingual extraction (title, attendance, windows, room_types, needs)  │
│  - faculty-request-parser.ts: Intents (mark_unavailability, additional_session, relocation)  │
│  - decision-explainer.ts: Evidence-grounded explanations strictly from backend records       │
│  - ai-tool-registry.ts: Read-only context tools (lookup_my_sessions, lookup_rooms)          │
└─────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                              │
                                              ▼
                               ┌────────────────────────────────┐
                               │   Google Gemini 3.8 Flash API  │
                               │     Structured Output (Zod)    │
                               └──────────────┬─────────────────┘
                                              │
                                              ▼
                               ┌────────────────────────────────┐
                               │   Deterministic Solvers & DB   │
                               │   CP-SAT & validator.py        │
                               └────────────────────────────────┘
```

## 3. Core Architecture Rules

1. **Server-Side API Key Isolation**: `GEMINI_API_KEY` is loaded exclusively on the Node.js server via `config/env.ts`. It is never sent to the browser or placed in public files.
2. **Unified Client**: One shared `GoogleGenAI` instance is reused across all endpoints and user roles.
3. **Structured Outputs**: Model responses are constrained by JSON schemas and strictly validated on the backend using Zod before returning to the UI.
4. **Data Minimization**: Prompts receive only necessary, permission-scoped context (e.g., authenticated faculty's own sessions). Secrets, passwords, and private user credentials are never sent to Gemini.
5. **Graceful Fallback**: If `GEMINI_API_KEY` is missing or the API is unavailable, responses return `{ "manual_fallback_available": true }` and existing manual forms remain 100% functional.
