import React, { useState } from 'react';
import {
  Bot,
  Send,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

const QUICK_PROMPTS = [
  'Need a seminar hall for 60 students on Thursday afternoon with projector',
  'Humko Friday ko robotics workshop karna hai, 80 students honge aur projector chahiye',
  'Move my CS301 class to Wednesday',
  'Need one more CS202 tutorial next week',
];

interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
  draft?: Record<string, unknown>;
  question?: string;
  safetyNote?: string;
}

export function AdminAiAssistantPage() {
  const [promptText, setPromptText] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'ai',
      text: 'Welcome to the CIT Schedora Shared AI Assistant. Describe a venue booking, faculty unavailability, or session relocation in English or Hinglish.',
    },
  ]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || promptText;
    if (!text.trim()) return;

    const userMsg: ChatMessage = { sender: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setPromptText('');

    try {
      setLoading(true);

      const res = await fetch('/api/v1/ai/conversations/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userMessage: text,
          conversationHistory: messages.map((m) => ({ sender: m.sender, text: m.text })),
        }),
      });

      if (!res.ok) {
        throw new Error('AI Orchestrator service unavailable.');
      }

      const json = await res.json();
      const { responseText, updatedDraft, question, safety_note } = json.data;

      const aiMsg: ChatMessage = {
        sender: 'ai',
        text: responseText || 'Extracted structured proposal draft.',
        draft: updatedDraft,
        question: question || undefined,
        safetyNote: safety_note || undefined,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: err.message || 'AI assistant is temporarily unavailable. Manual fallback available.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <RoleWorkspaceLayout
      title="AI Scheduling Assistant"
      subtitle="Request timetable changes and venue evaluations using natural language in English or Hinglish."
      breadcrumbCurrent="AI Scheduling Assistant"
    >
      <div className="space-y-6" data-testid="admin-ai-assistant-screen">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Conversational Workspace */}
          <section className="lg:col-span-2 rounded-xl border border-[#DCE4F0] bg-white shadow-xs flex flex-col justify-between overflow-hidden min-h-[500px]">
            <div>
              <div className="flex items-center justify-between border-b border-[#EEF2F8] px-5 py-4 bg-[#F8FAFC]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#132957] text-white font-bold">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#132957]">
                      CIT Schedora Shared AI Orchestrator
                    </div>
                    <div className="text-[11px] text-[#64748B]">
                      Gemini 3.8 Flash · English / Hindi / Hinglish Intent Extraction
                    </div>
                  </div>
                </div>
                <span className="rounded bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Ready
                </span>
              </div>

              {/* Message List */}
              <div className="p-5 space-y-4 max-h-[400px] overflow-y-auto">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col space-y-2 ${
                      m.sender === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl p-3.5 text-xs leading-relaxed ${
                        m.sender === 'user'
                          ? 'bg-[#132957] text-white rounded-br-none'
                          : 'bg-[#F8FAFC] border border-[#E2E8F0] text-[#182238] rounded-bl-none'
                      }`}
                    >
                      {m.text}
                    </div>

                    {m.question && (
                      <div className="max-w-[85%] rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                        <HelpCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Follow-Up Question:</span> {m.question}
                        </div>
                      </div>
                    )}

                    {m.draft && (
                      <div className="max-w-[85%] w-full rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 text-xs text-indigo-900 space-y-1">
                        <div className="font-bold text-indigo-950 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600" />
                          Parsed Structured Draft:
                        </div>
                        <pre className="text-[11px] font-mono bg-white p-2 rounded border border-indigo-100 text-slate-800 overflow-x-auto">
                          {JSON.stringify(m.draft, null, 2)}
                        </pre>
                      </div>
                    )}

                    {m.safetyNote && (
                      <div className="max-w-[85%] rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 flex items-start gap-2">
                        <ShieldCheck className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>{m.safetyNote}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Prompt Input Footer */}
            <div className="border-t border-[#EEF2F8] bg-[#FAFBFD] p-5 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-[#64748B]">
                  Quick prompts:
                </span>
                {QUICK_PROMPTS.map((qp, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPromptText(qp);
                      handleSend(qp);
                    }}
                    className="rounded bg-white border border-[#DCE4F0] px-2.5 py-1 text-[11px] text-[#132957] hover:bg-[#F8FAFC] cursor-pointer max-w-xs truncate"
                  >
                    {qp}
                  </button>
                ))}
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
                <input
                  type="text"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="Ask in English or Hinglish (e.g. 'Need a seminar hall for 80 students on Thursday')..."
                  className="flex-1 rounded-lg border border-[#D4DFED] bg-white px-3.5 py-2.5 text-xs text-[#182238] focus:border-[#294074] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading || !promptText.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#294074] cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send
                </button>
              </form>
            </div>
          </section>

          {/* Right Column: AI Boundaries & Security Policy */}
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EEF2F8] pb-3">
              <ShieldCheck className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-sm font-bold text-[#132957]">
                AI Boundaries &amp; Security
              </h2>
            </div>

            <div className="space-y-3 text-xs text-[#182238]">
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1">
                <div className="font-bold text-[#132957]">No Direct Database Writes</div>
                <p className="text-[11px] text-[#64748B]">
                  The Gemini AI assistant generates structured proposals. All approvals and database mutations require explicit user review and deterministic solver verification.
                </p>
              </div>

              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1">
                <div className="font-bold text-[#132957]">Multilingual Intelligence</div>
                <p className="text-[11px] text-[#64748B]">
                  Understands English, Hindi, and Hinglish. Official room codes, course IDs, and category labels are strictly preserved.
                </p>
              </div>

              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1">
                <div className="font-bold text-[#132957]">Prompt Injection Resistance</div>
                <p className="text-[11px] text-[#64748B]">
                  Attempts to elevate priority or override institutional rules are automatically intercepted and logged.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </RoleWorkspaceLayout>
  );
}
