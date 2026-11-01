# AI Usage Disclosure — CIT Schedora

## 1. Product AI Model & SDK

- **Primary Product AI Model**: Google Gemini 3.8 Flash (`gemini-3.8-flash`)
- **Official SDK**: `@google/genai` (`^2.32.0`)
- **Integration Scope**:
  - **Natural-Language Venue Request Understanding**: English, Hindi, and Hinglish parsing into structured booking drafts (`POST /api/v1/ai/venue-requests/parse`).
  - **Faculty Scheduling Assistant**: Unavailability windows, additional tutorial/lecture requests, and session relocations (`POST /api/v1/ai/faculty-requests/parse`).
  - **Conversational Clarification Engine**: Bounded multi-turn turns asking concise follow-up questions for ambiguous timings (`POST /api/v1/ai/conversations/turn`).
  - **Evidence-Based Decision Explanations**: Plain-language explanations referencing verified backend evidence records and validator logs (`POST /api/v1/ai/decisions/explain`).

## 2. Prohibited Product LLM Actions

The product LLM (`gemini-3.8-flash`) is **STRICTLY PROHIBITED** from executing the following operations:
1. Direct database writes or mutations.
2. Approving or rejecting booking requests.
3. Elevating user roles or priority tiers.
4. Overriding role category caps (`club_event`, `guest_lecture`, `department_event`, `institute_event`).
5. Bypassing room capacity or validator checks.
6. Accessing or exposing server secrets or API keys.

## 3. Development AI Tools

During the architecture, design, and implementation of CIT Schedora, the following development tools were utilized:
- **Google AI Studio Build**: Code generation, project orchestration, and build system.
- **Google Stitch**: UI layout and component baseline designs.
- **Google Gen AI TypeScript SDK (@google/genai)**: Runtime AI client integration.

All prompts used by the shared AI Orchestrator are stored in:
- `prompts/ai/system.md`
- `prompts/ai/venue-parser.md`
- `prompts/ai/faculty-parser.md`
- `prompts/ai/decision-explainer.md`
- `prompts/ai/prompt-injection-protection.md`
