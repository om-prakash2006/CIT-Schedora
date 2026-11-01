import React, { useState } from 'react';
import {
  ShieldCheck,
  Sliders,
  GitBranch,
  FileSearch,
  Search,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

type DecisionDomain =
  | 'TIMETABLE'
  | 'VENUE_BOOKING'
  | 'RESCHEDULING'
  | 'ROOM_ALLOCATION';

interface AiExplanationData {
  entity_id: string;
  explanation: string;
  verified_claims: string[];
  supporting_evidence_ids: string[];
  missing_evidence: string[];
  confidence_state: string;
}

export function AdminDecisionIntelligencePage() {
  const [domain, setDomain] = useState<DecisionDomain>('VENUE_BOOKING');
  const [entityQuery, setEntityQuery] = useState('BR-04');
  const [loading, setLoading] = useState(false);
  const [explanationData, setExplanationData] = useState<AiExplanationData | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const handleExplain = async (idToSearch?: string) => {
    const queryId = (idToSearch || entityQuery || '').trim();
    if (!queryId) return;

    try {
      setLoading(true);
      setFeedback(null);
      setExplanationData(null);

      const res = await fetch('/api/v1/ai/decisions/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entityId: queryId,
          entityType: domain === 'VENUE_BOOKING' ? 'booking_request' : 'timetable_session',
        }),
      });

      if (!res.ok) {
        throw new Error('Decision explanation service unavailable');
      }

      const json = await res.json();
      setExplanationData(json.data);
      setFeedback({
        type: 'success',
        message: `Generated evidence-based decision explanation for ${queryId}.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to generate explanation.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <RoleWorkspaceLayout
      title="Decision Intelligence"
      subtitle="Grounded explainability for every scheduling assignment, constraint evaluation, and rejected alternative."
      breadcrumbCurrent="Decision Intelligence"
    >
      <div className="space-y-6" data-testid="admin-decision-intelligence-screen">
        {/* Domain Tabs & Entity Search */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex flex-wrap rounded-lg border border-[#DCE4F0] bg-[#F8FAFC] p-1 gap-1">
            {[
              { id: 'VENUE_BOOKING', label: 'Venue Booking Decision' },
              { id: 'TIMETABLE', label: 'Timetable Assignment' },
              { id: 'RESCHEDULING', label: 'Disruption Repair' },
              { id: 'ROOM_ALLOCATION', label: 'Exam Room Allocation' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDomain(tab.id as DecisionDomain)}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold cursor-pointer ${
                  domain === tab.id
                    ? 'bg-[#132957] text-white'
                    : 'text-[#475569] hover:text-[#182238]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
              <input
                type="text"
                value={entityQuery}
                onChange={(e) => setEntityQuery(e.target.value)}
                placeholder="Request ID (e.g. BR-04, BR-09, BR-17)..."
                className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] pl-9 pr-3 py-1.5 text-xs text-[#182238]"
              />
            </div>
            <button
              type="button"
              onClick={() => handleExplain()}
              disabled={loading || !entityQuery.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-4 py-2 text-xs font-semibold text-white hover:bg-[#294074] cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Explain Decision
            </button>
          </div>
        </section>

        {feedback && (
          <div
            className={`flex items-start gap-2.5 rounded-lg border p-3.5 text-xs ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : feedback.type === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-900'
                : 'border-blue-200 bg-blue-50 text-blue-900'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 font-medium">{feedback.message}</div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-[11px] font-semibold text-gray-500 hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Quick Select Preset Buttons */}
        <section className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-[#132957]">Quick Test Records:</span>
          {['BR-04', 'BR-09', 'BR-17', 'BR-18', 'BR-20'].map((reqId) => (
            <button
              key={reqId}
              type="button"
              onClick={() => {
                setEntityQuery(reqId);
                handleExplain(reqId);
              }}
              className="rounded-md border border-[#DCE4F0] bg-white px-3 py-1 text-xs font-mono font-semibold text-[#132957] hover:bg-[#F8FAFC] cursor-pointer"
            >
              {reqId}
            </button>
          ))}
        </section>

        {/* Explanation Output Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#132957]" />
                <h2 className="font-serif text-base font-bold text-[#132957]">
                  Gemini Evidence Explanation
                </h2>
              </div>
              <span className="rounded bg-[#FBEFA3] px-2.5 py-0.5 text-[11px] font-bold text-[#182238]">
                Grounded Proof Trace
              </span>
            </div>

            {explanationData ? (
              <div className="space-y-3 pt-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-[#182238] leading-relaxed font-medium">
                  {explanationData.explanation}
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                    SUPPORTING EVIDENCE IDS
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {explanationData.supporting_evidence_ids.map((evId) => (
                      <span
                        key={evId}
                        className="rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-mono font-bold text-indigo-900"
                      >
                        {evId}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center text-xs text-[#64748B]">
                Enter a request ID above (e.g. BR-04, BR-09, BR-17) or click a quick test record to generate an evidence-grounded AI explanation.
              </div>
            )}
          </section>

          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#132957]" />
                <h2 className="font-serif text-base font-bold text-[#132957]">
                  Verified Factual Claims
                </h2>
              </div>
              <span className="rounded bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-semibold text-[#475569]">
                Backend Database Proof
              </span>
            </div>

            {explanationData ? (
              <div className="space-y-2 pt-2">
                {explanationData.verified_claims.map((claim, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs text-[#182238]"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>{claim}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center text-xs text-[#64748B]">
                Verified backend proof traces will appear here when an entity is analyzed.
              </div>
            )}
          </section>
        </div>
      </div>
    </RoleWorkspaceLayout>
  );
}
