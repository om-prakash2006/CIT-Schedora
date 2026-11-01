import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  ArrowRightLeft,
  CalendarPlus,
  ShieldCheck,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

export function FacultyTimetablePage() {
  const [weekHorizon, setWeekHorizon] = useState<'REGULAR' | 'SPECTRA'>('REGULAR');
  const [timetable, setTimetable] = useState<any | null>(null);
  const [requestsCount, setRequestsCount] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/rbac/faculty/F01/timetable', { credentials: 'include' }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch('/api/v1/rbac/faculty/F01/requests', { credentials: 'include' }).then((r) =>
        r.ok ? r.json() : null
      ),
    ])
      .then(([tt, reqs]) => {
        if (tt) setTimetable(tt);
        if (Array.isArray(reqs?.requests)) setRequestsCount(reqs.requests.length);
      })
      .catch(() => {});
  }, []);

  const sessions = Array.isArray(timetable?.sessions) ? timetable.sessions : [];
  const uniqueCourses = Array.from(new Set(sessions.map((s: any) => s.course_id)));

  return (
    <RoleWorkspaceLayout
      title="My Timetable"
      subtitle="Personal teaching schedule, assigned lecture halls and laboratories, and protected free windows."
      breadcrumbCurrent="My Timetable"
      headerActions={
        <div className="flex items-center gap-2.5">
          <div className="inline-flex rounded-lg border border-[#DCE4F0] bg-white p-1">
            <button
              type="button"
              onClick={() => setWeekHorizon('REGULAR')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                weekHorizon === 'REGULAR'
                  ? 'bg-[#132957] text-white'
                  : 'text-[#475569]'
              }`}
            >
              Regular Week
            </button>
            <button
              type="button"
              onClick={() => setWeekHorizon('SPECTRA')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                weekHorizon === 'SPECTRA'
                  ? 'bg-[#132957] text-white'
                  : 'text-[#475569]'
              }`}
            >
              Spectra Week
            </button>
          </div>

          <Link
            to="/faculty/scheduling-requests"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE4F0] bg-white px-3.5 py-2 text-xs font-semibold text-[#182238] hover:bg-[#F8FAFC]"
          >
            <CalendarPlus className="h-3.5 w-3.5 text-[#132957]" />
            Scheduling Requests
          </Link>
          <Link
            to="/faculty/session-relocation"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#132957] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#294074]"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Relocate a Session
          </Link>
        </div>
      }
    >
      <div className="space-y-6" data-testid="faculty-timetable-screen">
        {/* Teaching Load Summary */}
        <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              ASSIGNED COURSES
            </div>
            <div className="mt-1 text-lg font-bold text-[#132957]">
              {uniqueCourses.length > 0 ? uniqueCourses.join(', ') : 'Awaiting Timetable'}
            </div>
            <div className="mt-0.5 text-xs text-[#64748B]">
              {timetable?.faculty?.name || 'Scoped to authenticated faculty ID'} ({timetable?.facultyId || 'F01'})
            </div>
          </div>

          <div className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              WEEKLY TEACHING LOAD
            </div>
            <div className="mt-1 text-lg font-bold text-[#132957]">
              {timetable?.weeklyHours ?? 0} hrs scheduled ({sessions.length} sessions)
            </div>
            <div className="mt-0.5 text-xs text-[#64748B]">
              Lectures, Tutorials &amp; Practical Labs
            </div>
          </div>

          <div className="rounded-xl border border-[#E7DFCF] bg-[#FFFDF8] p-4 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#B45309]">
              PROTECTED LUNCH WINDOW
            </div>
            <div className="mt-1 text-lg font-bold text-[#182238]">
              13:00 – 14:00
            </div>
            <div className="mt-0.5 text-xs text-[#64748B]">
              Guaranteed daily non-teaching hour
            </div>
          </div>

          <div className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              PENDING REQUESTS
            </div>
            <div className="mt-1 text-lg font-bold text-[#132957]">{requestsCount}</div>
            <div className="mt-0.5 text-xs text-[#64748B]">
              Relocations &amp; unavailability notices
            </div>
          </div>
        </section>

        {/* Weekly Personal Timetable Grid */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#EEF2F8] pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Personal Teaching Matrix ({weekHorizon === 'REGULAR' ? 'Regular Week P1–P9' : 'Spectra Week P1–P13'})
              </h2>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-[#64748B]">
              <Clock className="h-3.5 w-3.5" />
              Monday – Friday
            </span>
          </div>

          {sessions.length === 0 ? (
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center">
              <div className="text-sm font-bold text-[#132957]">
                No Published Faculty Timetable Loaded
              </div>
              <p className="mt-1 text-xs text-[#64748B] max-w-lg mx-auto">
                Once the Dean’s Office generates and publishes the master timetable for the active dataset, your assigned lectures, tutorials, and laboratory sessions will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                    <th className="py-2.5 pr-3">Session ID</th>
                    <th className="py-2.5 px-3">Course</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Day &amp; Period</th>
                    <th className="py-2.5 px-3">Assigned Venue</th>
                    <th className="py-2.5 pl-3">Student Group</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF2F8]">
                  {sessions.map((s: any) => (
                    <tr key={s.id}>
                      <td className="py-2.5 pr-3 font-mono font-bold text-[#132957]">{s.id}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#182238]">
                          {s.course_id} · {s.course_title}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 uppercase font-mono text-[11px] text-[#475569]">
                        {s.session_type} ({s.duration_periods}p)
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#132957]">
                        {s.day ? `${s.day} · P${s.start_period}${s.end_period > s.start_period ? `–P${s.end_period}` : ''}` : 'Unassigned'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#132957]">
                        {s.room_id || '—'}
                      </td>
                      <td className="py-2.5 pl-3 font-mono text-[11px] text-[#475569]">
                        {s.group_id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-2 pt-3 border-t border-[#EEF2F8] text-xs text-[#64748B]">
            <ShieldCheck className="h-4 w-4 text-[#132957]" />
            <span>
              Faculty members can inspect their own teaching assignments and submit self-scoped scheduling requests.
            </span>
          </div>
        </section>
      </div>
    </RoleWorkspaceLayout>
  );
}

