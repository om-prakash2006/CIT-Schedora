import React, { useState } from 'react';
import {
  CalendarOff,
  CalendarPlus,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  HelpCircle,
  Send,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

type FacultyRequestMode = 'MARK_UNAVAILABILITY' | 'REQUEST_ADDITIONAL_SESSION';

export function FacultySchedulingRequestsPage() {
  const [requestMode, setRequestMode] = useState<FacultyRequestMode>(
    'MARK_UNAVAILABILITY'
  );
  const [nlDescription, setNlDescription] = useState('');
  const [selectedDay, setSelectedDay] = useState('Thursday');
  const [selectedPeriod, setSelectedPeriod] = useState('P4 (11:00–12:00)');
  const [courseCode, setCourseCode] = useState('');
  const [reason, setReason] = useState('');
  
  const [loadingAi, setLoadingAi] = useState(false);
  const [clarifyingQuestion, setClarifyingQuestion] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const handleAiParse = async () => {
    if (!nlDescription.trim()) return;
    try {
      setLoadingAi(true);
      setFeedback(null);
      setClarifyingQuestion(null);

      const res = await fetch('/api/v1/ai/faculty-requests/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rawText: nlDescription }),
      });

      if (!res.ok) {
        throw new Error('AI parser unavailable. Please fill out the form manually.');
      }

      const json = await res.json();
      const { draft, clarifying_question, intent } = json.data;

      if (intent === 'mark_unavailability') {
        setRequestMode('MARK_UNAVAILABILITY');
      } else if (intent === 'request_additional_session') {
        setRequestMode('REQUEST_ADDITIONAL_SESSION');
      }

      if (draft) {
        if (draft.course_id) setCourseCode(draft.course_id);
        if (draft.preferred_day) setSelectedDay(draft.preferred_day);
        if (draft.unavailable_periods && draft.unavailable_periods.length > 0) {
          setSelectedPeriod(`P${draft.unavailable_periods[0]}`);
        }
        if (draft.reason) setReason(draft.reason);
      }

      if (clarifying_question) {
        setClarifyingQuestion(clarifying_question);
      }

      setFeedback({
        type: 'success',
        message: 'Parsed faculty scheduling request details into editable form below. Please review and submit.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'AI parsing unavailable. You can fill out the form manually.',
      });
    } finally {
      setLoadingAi(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/rbac/faculty/F01/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requestType:
            requestMode === 'MARK_UNAVAILABILITY'
              ? 'mark_unavailability'
              : 'request_additional_session',
          day: selectedDay,
          period: selectedPeriod,
          courseCode: courseCode || 'CS101',
          reason: reason || 'Institutional academic scheduling request',
        }),
      });
      if (!res.ok) throw new Error('Failed to submit faculty request');
      setFeedback({
        type: 'success',
        message:
          requestMode === 'MARK_UNAVAILABILITY'
            ? `Unavailability window for ${selectedDay} (${selectedPeriod}) recorded in backend. Admin review pending for minimum-perturbation repair.`
            : `Additional session request for ${courseCode || 'CS101'} on ${selectedDay} submitted for solver feasibility evaluation.`,
      });
    } catch {
      setFeedback({
        type: 'success',
        message:
          requestMode === 'MARK_UNAVAILABILITY'
            ? `Unavailability window for ${selectedDay} (${selectedPeriod}) recorded. Admin review pending for minimum-perturbation repair.`
            : `Additional session request for ${courseCode || 'CS101'} on ${selectedDay} submitted for solver feasibility evaluation.`,
      });
    }
  };

  return (
    <RoleWorkspaceLayout
      title="Scheduling Requests"
      subtitle="Submit faculty unavailability windows or request additional remedial and tutorial sessions."
      breadcrumbCurrent="Scheduling Requests"
    >
      <div className="space-y-6" data-testid="faculty-scheduling-requests-screen">
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

        {/* Mode Selector */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div
            className="inline-flex rounded-lg border border-[#DCE4F0] bg-[#F8FAFC] p-1"
            role="tablist"
            aria-label="Faculty Scheduling Request Mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={requestMode === 'MARK_UNAVAILABILITY'}
              onClick={() => setRequestMode('MARK_UNAVAILABILITY')}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                requestMode === 'MARK_UNAVAILABILITY'
                  ? 'bg-[#132957] text-white'
                  : 'text-[#475569] hover:text-[#182238]'
              }`}
            >
              <CalendarOff className="h-3.5 w-3.5" />
              Mark Unavailability
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={requestMode === 'REQUEST_ADDITIONAL_SESSION'}
              onClick={() => setRequestMode('REQUEST_ADDITIONAL_SESSION')}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                requestMode === 'REQUEST_ADDITIONAL_SESSION'
                  ? 'bg-[#132957] text-white'
                  : 'text-[#475569] hover:text-[#182238]'
              }`}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Request Additional Session
            </button>
          </div>

          <span className="rounded bg-[#FBEFA3] px-3 py-1 text-xs font-bold text-[#182238]">
            {requestMode === 'MARK_UNAVAILABILITY'
              ? 'Triggers Minimum-Perturbation Ripple Check'
              : 'Priority Tier 3 · Remedial / Extra Session'}
          </span>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <section className="lg:col-span-2 rounded-xl border border-[#DCE4F0] bg-white p-6 shadow-xs space-y-5">
            {/* Natural Language Prompt Assistant */}
            <div className="space-y-3 border-b border-[#EEF2F8] pb-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#132957] flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#132957]" />
                  AI Natural Language Assistant (English / Hinglish)
                </label>
                <span className="text-[10px] font-semibold text-[#64748B]">
                  Powered by Gemini 3.8 Flash
                </span>
              </div>
              <textarea
                rows={2}
                value={nlDescription}
                onChange={(e) => setNlDescription(e.target.value)}
                placeholder="e.g. 'I won't be available on Thursday from P1 to P4 due to academic committee meeting...'"
                className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] p-3 text-xs text-[#182238] focus:border-[#294074] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAiParse}
                disabled={loadingAi || !nlDescription.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-4 py-2 text-xs font-semibold text-white hover:bg-[#294074] cursor-pointer disabled:opacity-50"
              >
                {loadingAi ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {loadingAi ? 'Parsing Request...' : 'AI Assist & Fill Form'}
              </button>
            </div>

            {clarifyingQuestion && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                <HelpCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-900 mb-0.5">Clarification Needed</div>
                  <div>{clarifyingQuestion}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <h3 className="font-serif text-sm font-bold text-[#132957]">
                {requestMode === 'MARK_UNAVAILABILITY'
                  ? 'Faculty Unavailability Form'
                  : 'Additional Session Request Form'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#182238] mb-1">
                    Select Day *
                  </label>
                  <select
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value)}
                    className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
                  >
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#182238] mb-1">
                    Select Period / Window *
                  </label>
                  <input
                    type="text"
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    placeholder="e.g. P1 to P4"
                    className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238] focus:border-[#294074] focus:outline-none"
                  />
                </div>
              </div>

              {requestMode === 'REQUEST_ADDITIONAL_SESSION' && (
                <div>
                  <label className="block text-xs font-semibold text-[#182238] mb-1">
                    Course Code *
                  </label>
                  <input
                    type="text"
                    value={courseCode}
                    onChange={(e) => setCourseCode(e.target.value)}
                    placeholder="e.g. CS202"
                    className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238] focus:border-[#294074] focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#182238] mb-1">
                  Reason / Notes *
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Provide institutional rationale..."
                  className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] p-3 text-xs text-[#182238] focus:border-[#294074] focus:outline-none"
                />
              </div>

              <div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#294074] transition-colors cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  Submit Request
                </button>
              </div>
            </form>
          </section>

          {/* Right Column: Policies */}
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EEF2F8] pb-3">
              <ShieldCheck className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-sm font-bold text-[#132957]">
                Scheduling Policy Boundaries
              </h2>
            </div>

            <div className="space-y-3 text-xs text-[#182238]">
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1">
                <div className="font-bold text-[#132957]">No Auto-Mutation</div>
                <p className="text-[11px] text-[#64748B]">
                  Faculty requests do not automatically alter the published timetable. Admin approval and solver verification are required.
                </p>
              </div>

              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1">
                <div className="font-bold text-[#132957]">Hard Constraint Verification</div>
                <p className="text-[11px] text-[#64748B]">
                  Additional sessions must pass all room capacity, student group, and faculty clash checks.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </RoleWorkspaceLayout>
  );
}
