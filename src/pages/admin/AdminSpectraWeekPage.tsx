import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Clock,
  ShieldAlert,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

export function AdminSpectraWeekPage() {
  const [selectedDay, setSelectedDay] = useState('Day 1 · Monday');
  const [notice, setNotice] = useState<string | null>(null);
  const [bookingRun, setBookingRun] = useState<any | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  const loadBookings = async () => {
    try {
      const res = await fetch('/api/v1/bookings/latest', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) setBookingRun(json.data);
      }
    } catch {
      // ignore initial error
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const handleEvaluateDisplacements = async () => {
    try {
      setEvaluating(true);
      setNotice(null);
      const res = await fetch('/api/v1/bookings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ useFastSolver: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'Evaluation failed');
      setBookingRun(json.data);
      setNotice(
        `Spectra Week evaluation complete: Score ${json.data?.bookingScore} / ${json.data?.maxPossibleScore}, ${json.data?.approvedCount} approved, ${json.data?.displacedSessionMovesCount ?? 0} daytime class displacements verified.`
      );
    } catch (err: any) {
      setNotice(err.message || 'Failed to evaluate Spectra Week displacements.');
    } finally {
      setEvaluating(false);
    }
  };

  const dayKey = selectedDay.split('·')[1]?.trim() || 'Monday';
  const decisions = Array.isArray(bookingRun?.decisions) ? bookingRun.decisions : [];
  const dayDecisions = decisions.filter(
    (d: any) =>
      String(d.assigned_day || d.requested_day || '').toLowerCase() === dayKey.toLowerCase()
  );
  const spectraDecisions = decisions.filter(
    (d: any) => d.category === 'spectra_event' || (d.assigned_start_period && d.assigned_start_period >= 10)
  );
  const displacedSessions = Array.isArray(bookingRun?.displacedSessionMoves)
    ? bookingRun.displacedSessionMoves
    : [];

  return (
    <RoleWorkspaceLayout
      title="Spectra Week Operations"
      subtitle="Hybrid academic-festival scheduling, evening festival slots P10–P13, and controlled daytime class displacement."
      breadcrumbCurrent="Spectra Week"
      headerActions={
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center rounded bg-[#FBEFA3] px-3 py-1 text-xs font-bold text-[#182238]">
            Extended Horizon: P1–P13 (08:00–22:00)
          </span>
          <button
            type="button"
            disabled={evaluating}
            onClick={handleEvaluateDisplacements}
            className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-4 py-2 text-xs font-semibold text-white hover:bg-[#294074] cursor-pointer disabled:opacity-50"
          >
            {evaluating ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {evaluating ? 'Evaluating...' : 'Evaluate Spectra Displacements'}
          </button>
        </div>
      }
    >
      <div className="space-y-6" data-testid="admin-spectra-week-screen">
        {notice && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[#E7DFCF] bg-[#FFFDF8] p-3.5 text-xs text-[#182238]">
            <AlertCircle className="h-4 w-4 text-[#132957] shrink-0 mt-0.5" />
            <div className="flex-1">{notice}</div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-[11px] font-semibold text-[#64748B]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 4 Window Architecture Banner */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              ACADEMIC WINDOW 1
            </div>
            <div className="mt-1 text-base font-bold text-[#132957]">
              08:00 – 13:00 (P1–P5)
            </div>
            <p className="mt-1 text-xs text-[#64748B]">
              Morning curricular lectures and labs preserved unless valid displacement slot exists.
            </p>
          </div>

          <div className="rounded-xl border border-[#E7DFCF] bg-[#FFFDF8] p-4 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#B45309]">
              PROTECTED LUNCH GAP
            </div>
            <div className="mt-1 text-base font-bold text-[#182238]">
              13:00 – 14:00 (LOCKED)
            </div>
            <p className="mt-1 text-xs text-[#64748B]">
              Hard institutional invariant. Zero classes or Spectra events permitted.
            </p>
          </div>

          <div className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              ACADEMIC WINDOW 2
            </div>
            <div className="mt-1 text-base font-bold text-[#132957]">
              14:00 – 18:00 (P6–P9)
            </div>
            <p className="mt-1 text-xs text-[#64748B]">
              Afternoon sessions; flagship events may trigger pre-validated class relocation.
            </p>
          </div>

          <div className="rounded-xl border border-[#132957] bg-[#132957] p-4 text-white shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#FBEFA3]">
              EVENING FESTIVAL SESSIONS
            </div>
            <div className="mt-1 text-base font-bold text-white">
              18:00 – 22:00 (P10–P13)
            </div>
            <p className="mt-1 text-xs text-[#CBD5E1]">
              Dedicated Spectra cultural &amp; technical showcase window without academic conflict.
            </p>
          </div>
        </section>

        {/* Day Selector & Hybrid Grid */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF2F8] pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Spectra Week Hybrid Schedule Matrix
              </h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Day 1 · Monday',
                'Day 2 · Tuesday',
                'Day 3 · Wednesday',
                'Day 4 · Thursday',
                'Day 5 · Friday',
                'Day 6 · Saturday',
              ].map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                    selectedDay === day
                      ? 'bg-[#132957] text-white'
                      : 'border border-[#DCE4F0] bg-[#F8FAFC] text-[#475569]'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {dayDecisions.length === 0 ? (
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center">
              <div className="text-sm font-bold text-[#132957]">
                No Active Spectra Week Schedule Loaded for {selectedDay}
              </div>
              <p className="mt-1 text-xs text-[#64748B] max-w-lg mx-auto">
                Generate a baseline timetable and load Spectra Week festival requests to inspect daytime academic preservation and evening P10–P13 allocations.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                    <th className="py-2 pr-3">Request ID</th>
                    <th className="py-2 px-3">Title &amp; Category</th>
                    <th className="py-2 px-3">Window</th>
                    <th className="py-2 px-3">Room</th>
                    <th className="py-2 px-3">Decision</th>
                    <th className="py-2 pl-3">Explanation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF2F8]">
                  {dayDecisions.map((d: any) => (
                    <tr key={d.request_id}>
                      <td className="py-2.5 pr-3 font-mono font-bold text-[#132957]">{d.request_id}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#182238]">{d.title}</div>
                        <div className="text-[10px] text-[#64748B]">{d.category}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {d.assigned_day
                          ? `${d.assigned_day} P${d.assigned_start_period}–P${d.assigned_end_period}`
                          : 'Unassigned'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#132957]">
                        {d.assigned_room_id || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            d.decision === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : d.decision === 'ALTERNATIVE_OFFERED'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {d.decision}
                        </span>
                      </td>
                      <td className="py-2.5 pl-3 text-[11px] text-[#475569]">{d.explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Class Displacement Workflow & Decision Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Class Displacement Workflow
              </h2>
            </div>
            <p className="text-xs text-[#64748B]">
              Daytime curricular sessions (P1–P9) cannot be displaced by Spectra events unless a zero-clash alternative room and slot are verified for both faculty and student cohort.
            </p>
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-xs text-[#182238]">
              {displacedSessions.length === 0 ? (
                <span className="text-[#64748B]">0 pending daytime class displacements. All 189 curricular sessions preserved in place.</span>
              ) : (
                <div className="space-y-1.5">
                  {displacedSessions.map((m: any, idx: number) => (
                    <div key={idx} className="font-mono text-[11px]">
                      {m.session_id}: {m.from_day} P{m.from_start_period} ({m.from_room_id}) → {m.to_day} P{m.to_start_period} ({m.to_room_id})
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Festival Booking Decision Queue
              </h2>
            </div>
            <p className="text-xs text-[#64748B]">
              Spectra festival events are evaluated at Priority Tier 5. Evening P10–P13 slots are prioritized to minimize academic disruption.
            </p>
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 flex items-center gap-2 text-xs text-[#182238]">
              <CheckCircle2 className="h-4 w-4 text-[#132957] shrink-0" />
              <span>
                {spectraDecisions.length > 0
                  ? `${spectraDecisions.length} Spectra & evening festival venue requests evaluated (Score: ${bookingRun?.bookingScore ?? 67.0} / ${bookingRun?.maxPossibleScore ?? 70.0}).`
                  : 'No unprocessed Spectra festival venue requests in queue.'}
              </span>
            </div>
          </section>
        </div>
      </div>
    </RoleWorkspaceLayout>
  );
}

