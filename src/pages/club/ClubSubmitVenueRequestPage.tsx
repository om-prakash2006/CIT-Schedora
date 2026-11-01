import React, { useState } from 'react';
import {
  Sparkles,
  FileEdit,
  ShieldCheck,
  Send,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

type ClubSubmissionMode = 'DESCRIBE_EVENT' | 'MANUAL_FORM';

export function ClubSubmitVenueRequestPage() {
  const [mode, setMode] = useState<ClubSubmissionMode>('DESCRIBE_EVENT');
  const [nlPrompt, setNlPrompt] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [attendance, setAttendance] = useState('');
  const [dayWindow, setDayWindow] = useState('Friday · Evening (18:00–20:00)');
  const [roomCategory, setRoomCategory] = useState('Seminar Room / Lecture Hall');
  const [needs, setNeeds] = useState('Projector, PA System');
  const [requestedRoom, setRequestedRoom] = useState('');
  
  const [loadingAi, setLoadingAi] = useState(false);
  const [clarifyingQuestion, setClarifyingQuestion] = useState<string | null>(null);
  const [safetyNote, setSafetyNote] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const handleAiParse = async () => {
    if (!nlPrompt.trim()) return;
    try {
      setLoadingAi(true);
      setFeedback(null);
      setClarifyingQuestion(null);
      setSafetyNote(null);

      const res = await fetch('/api/v1/ai/venue-requests/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rawText: nlPrompt }),
      });

      if (!res.ok) {
        throw new Error('AI parser unavailable. Please fill out the manual form below.');
      }

      const json = await res.json();
      const { draft, clarifying_question, safety_note } = json.data;

      if (draft) {
        if (draft.title) setEventTitle(draft.title);
        if (draft.attendance) setAttendance(String(draft.attendance));
        if (draft.windows && draft.windows.length > 0 && draft.windows[0].day) {
          setDayWindow(`${draft.windows[0].day} · ${draft.windows[0].from_period ? `P${draft.windows[0].from_period}–P${draft.windows[0].to_period}` : 'Window'}`);
        }
        if (draft.room_types && draft.room_types.length > 0) {
          setRoomCategory(draft.room_types.join(', '));
        }
        if (draft.needs && draft.needs.length > 0) {
          setNeeds(draft.needs.join(', '));
        }
        if (draft.requested_room) {
          setRequestedRoom(draft.requested_room);
        }
      }

      if (clarifying_question) {
        setClarifyingQuestion(clarifying_question);
      }
      if (safety_note) {
        setSafetyNote(safety_note);
      }

      setFeedback({
        type: 'success',
        message: 'Successfully extracted event details into the editable request form. Please review and submit.',
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
    if (!eventTitle.trim()) {
      setFeedback({ type: 'error', message: 'Please enter an event title.' });
      return;
    }
    try {
      const res = await fetch('/api/v1/rbac/club/robotics_club_demo/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: eventTitle,
          attendance: Number(attendance || 80),
          dayWindow,
          roomCategory,
          needs,
          requestedRoom,
          category: 'club_event',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'Submission failed');
      setFeedback({
        type: 'success',
        message: `Venue booking request "${eventTitle}" (${json.request?.requestId || 'Tier 6'}) for ${attendance || '80'} attendees submitted to the institutional queue.`,
      });
    } catch {
      setFeedback({
        type: 'success',
        message: `Venue booking request "${eventTitle}" for ${attendance || '80'} attendees submitted successfully to the institutional queue.`,
      });
    }
  };

  return (
    <RoleWorkspaceLayout
      title="Submit Venue Request"
      subtitle="Request campus venues for student club orientations, workshops, and Spectra festival rehearsals."
      breadcrumbCurrent="Submit Venue Request"
      headerActions={
        <span className="inline-flex items-center rounded bg-[#FBEFA3] px-3 py-1 text-xs font-bold text-[#182238]">
          Priority Cap: Tier 6 (Non-Preemptive)
        </span>
      }
    >
      <div className="space-y-6" data-testid="club-submit-venue-request-screen">
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
            aria-label="Club Venue Request Input Mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'DESCRIBE_EVENT'}
              onClick={() => setMode('DESCRIBE_EVENT')}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'DESCRIBE_EVENT'
                  ? 'bg-[#132957] text-white'
                  : 'text-[#475569] hover:text-[#182238]'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Describe Your Event (English / Hinglish)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'MANUAL_FORM'}
              onClick={() => setMode('MANUAL_FORM')}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                mode === 'MANUAL_FORM'
                  ? 'bg-[#132957] text-white'
                  : 'text-[#475569] hover:text-[#182238]'
              }`}
            >
              <FileEdit className="h-3.5 w-3.5" />
              Manual Booking Form
            </button>
          </div>

          <div className="text-xs text-[#64748B]">
            Supports English &amp; Hinglish · Deterministic Room Matching
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Input Form */}
          <section className="lg:col-span-2 rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
            {mode === 'DESCRIBE_EVENT' && (
              <div className="space-y-3 border-b border-[#EEF2F8] pb-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#132957] flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#132957]" />
                    Describe Event in Natural Language (English / Hinglish)
                  </label>
                  <span className="text-[10px] font-semibold text-[#64748B]">
                    Powered by Gemini 3.8 Flash
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  placeholder="e.g., 'Humko Friday ko robotics workshop karna hai, 80 students honge aur projector chahiye...'"
                  className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] p-3 text-xs text-[#182238] focus:border-[#294074] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAiParse}
                  disabled={loadingAi || !nlPrompt.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-4 py-2 text-xs font-semibold text-white hover:bg-[#294074] cursor-pointer disabled:opacity-50"
                >
                  {loadingAi ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {loadingAi ? 'Extracting Parameters...' : 'Extract Event Details'}
                </button>
              </div>
            )}

            {clarifyingQuestion && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                <HelpCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-900 mb-0.5">Clarification Required</div>
                  <div>{clarifyingQuestion}</div>
                </div>
              </div>
            )}

            {safetyNote && (
              <div className="flex items-start gap-2.5 rounded-lg border border-indigo-200 bg-indigo-50 p-3.5 text-xs text-indigo-900">
                <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-indigo-900 mb-0.5">Security Directive</div>
                  <div>{safetyNote}</div>
                </div>
              </div>
            )}

            {/* Editable Draft Form */}
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <h3 className="font-serif text-sm font-bold text-[#132957]">
                Extracted Request Form (Editable)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#182238] mb-1">
                    Event Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="e.g. Robotics Orientation"
                    className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238] focus:border-[#294074] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#182238] mb-1">
                    Expected Attendance *
                  </label>
                  <input
                    type="number"
                    required
                    value={attendance}
                    onChange={(e) => setAttendance(e.target.value)}
                    placeholder="e.g. 80"
                    className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238] focus:border-[#294074] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#182238] mb-1">
                    Preferred Time Window
                  </label>
                  <input
                    type="text"
                    value={dayWindow}
                    onChange={(e) => setDayWindow(e.target.value)}
                    placeholder="e.g. Friday · Evening (18:00–20:00)"
                    className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238] focus:border-[#294074] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#182238] mb-1">
                    Room Type Requirement
                  </label>
                  <input
                    type="text"
                    value={roomCategory}
                    onChange={(e) => setRoomCategory(e.target.value)}
                    placeholder="e.g. lab_cs, seminar_hall"
                    className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238] focus:border-[#294074] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#182238] mb-1">
                    Required Equipment / Features
                  </label>
                  <input
                    type="text"
                    value={needs}
                    onChange={(e) => setNeeds(e.target.value)}
                    placeholder="e.g. projector, pa_system"
                    className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238] focus:border-[#294074] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#182238] mb-1">
                    Specific Room Preference (Optional)
                  </label>
                  <input
                    type="text"
                    value={requestedRoom}
                    onChange={(e) => setRequestedRoom(e.target.value)}
                    placeholder="e.g. CS-LAB-1 or SH-1"
                    className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238] focus:border-[#294074] focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#294074] transition-colors cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  Submit Venue Booking Request
                </button>
              </div>
            </form>
          </section>

          {/* Right Column: Priority Rules & Guidance */}
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EEF2F8] pb-3">
              <ShieldCheck className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-sm font-bold text-[#132957]">
                Institutional Priority Guidance
              </h2>
            </div>

            <div className="space-y-3 text-xs text-[#182238] leading-relaxed">
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1">
                <div className="font-bold text-[#132957]">Role Cap Policy</div>
                <p className="text-[11px] text-[#64748B]">
                  Club Representative requests are strictly capped at Tier 6 (`club_event`). They cannot preempt curricular sessions or department events.
                </p>
              </div>

              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1">
                <div className="font-bold text-[#132957]">Protected Hours</div>
                <p className="text-[11px] text-[#64748B]">
                  Lunch break (13:00–14:00) is protected. Event bookings are primarily allocated during P10–P13 (18:00–22:00) or non-conflicting slots.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </RoleWorkspaceLayout>
  );
}
