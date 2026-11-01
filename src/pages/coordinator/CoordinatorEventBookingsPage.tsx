import React, { useEffect, useState } from 'react';
import {
  Building2,
  PlusCircle,
  ShieldCheck,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

export function CoordinatorEventBookingsPage() {
  const [eventTitle, setEventTitle] = useState('');
  const [targetVenue, setTargetVenue] = useState('Department Seminar Hall');
  const [expectedAttendance, setExpectedAttendance] = useState('');
  const [daySlot, setDaySlot] = useState('Wednesday · P6–P7 (14:00–16:00)');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const loadBookings = async () => {
    try {
      const res = await fetch('/api/v1/rbac/coordinator/departments/CSE/bookings', {
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.bookings)) setBookings(json.bookings);
      }
    } catch {
      // ignore initial error
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) {
      setFeedback('Please enter an event title.');
      return;
    }
    try {
      setSubmitting(true);
      setFeedback(null);
      const res = await fetch('/api/v1/rbac/coordinator/departments/CSE/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: eventTitle,
          targetVenue,
          attendance: Number(expectedAttendance || 60),
          daySlot,
          category: 'department_event',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'Submission failed');
      setFeedback(
        `Department Event Booking "${eventTitle}" (${json.request?.request_id}) registered under CSE Priority Tier 4.`
      );
      setEventTitle('');
      setExpectedAttendance('');
      await loadBookings();
    } catch (err: any) {
      setFeedback(err.message || 'Failed to submit department event booking.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RoleWorkspaceLayout
      title="Department Event Bookings"
      subtitle="Coordinate academic seminars, guest colloquia, and department-scoped venue reservations at Priority Tier 4."
      breadcrumbCurrent="Department Event Bookings"
      headerActions={
        <span className="inline-flex items-center rounded bg-[#FBEFA3] px-3 py-1 text-xs font-bold text-[#182238]">
          Scope: Department Priority Tier 4
        </span>
      }
    >
      <div className="space-y-6" data-testid="coordinator-event-bookings-screen">
        {feedback && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[#E7DFCF] bg-[#FFFDF8] p-3.5 text-xs text-[#182238]">
            <AlertCircle className="h-4 w-4 text-[#132957] shrink-0 mt-0.5" />
            <div className="flex-1">{feedback}</div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-[11px] font-semibold text-[#64748B]"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: New Department Event Booking Form */}
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EEF2F8] pb-3">
              <PlusCircle className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-base font-bold text-[#132957]">
                New Department Event Request
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                  EVENT TITLE / COLLOQUIUM NAME
                </label>
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  placeholder="e.g., IEEE Departmental Technical Symposium"
                  className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                  PREFERRED DEPARTMENT VENUE
                </label>
                <select
                  value={targetVenue}
                  onChange={(e) => setTargetVenue(e.target.value)}
                  className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
                >
                  <option>Department Seminar Hall</option>
                  <option>Lecture Hall Complex</option>
                  <option>Departmental Conference Room</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                    ATTENDANCE
                  </label>
                  <input
                    type="number"
                    value={expectedAttendance}
                    onChange={(e) => setExpectedAttendance(e.target.value)}
                    placeholder="e.g., 85"
                    className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                    TARGET WINDOW
                  </label>
                  <select
                    value={daySlot}
                    onChange={(e) => setDaySlot(e.target.value)}
                    className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-2.5 py-2 text-xs text-[#182238]"
                  >
                    <option>Wednesday · P6–P7 (14:00–16:00)</option>
                    <option>Friday · P7–P8 (15:00–17:00)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-[#132957] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#294074] cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Department Event Booking'}
              </button>
            </form>
          </section>

          {/* Right 2 Columns: Department Event Booking Queue */}
          <section className="lg:col-span-2 rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-[#EEF2F8] pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-[#132957]" />
                  <h2 className="font-serif text-base font-bold text-[#132957]">
                    Department Event Booking Register
                  </h2>
                </div>
                <span className="text-xs text-[#64748B]">{bookings.length} Active Bookings</span>
              </div>

              {bookings.length === 0 ? (
                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center">
                  <Calendar className="mx-auto h-7 w-7 text-[#64748B] mb-2" />
                  <div className="text-sm font-bold text-[#132957]">
                    No Department Event Bookings Registered
                  </div>
                  <p className="mt-1 text-xs text-[#64748B] max-w-md mx-auto">
                    Department events submitted here are evaluated at Priority Tier 4 and verified against active cohort schedules and the 13:00–14:00 lunch block.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                        <th className="py-2 pr-3">ID</th>
                        <th className="py-2 px-3">Event Title</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3">Assigned Slot</th>
                        <th className="py-2 px-3">Room</th>
                        <th className="py-2 pl-3">Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF2F8]">
                      {bookings.map((b) => (
                        <tr key={b.request_id}>
                          <td className="py-2.5 pr-3 font-mono font-bold text-[#132957]">
                            {b.request_id}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-[#182238]">{b.title}</td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[#64748B]">
                            {b.category}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px]">
                            {b.assigned_day
                              ? `${b.assigned_day} P${b.assigned_start_period}–P${b.assigned_end_period}`
                              : b.daySlot || 'Pending'}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-[#132957]">
                            {b.assigned_room_id || b.targetVenue || '—'}
                          </td>
                          <td className="py-2.5 pl-3">
                            <span
                              className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                b.decision === 'APPROVED'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-blue-50 text-blue-700'
                              }`}
                            >
                              {b.decision || 'PENDING'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-[#EEF2F8] text-xs text-[#64748B]">
              <ShieldCheck className="h-4 w-4 text-[#132957]" />
              <span>
                Department Coordinators manage bookings strictly within their assigned academic department scope.
              </span>
            </div>
          </section>
        </div>
      </div>
    </RoleWorkspaceLayout>
  );
}

