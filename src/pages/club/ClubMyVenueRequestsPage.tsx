import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  PlusCircle,
  ShieldCheck,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

export function ClubMyVenueRequestsPage() {
  const [statusFilter, setStatusFilter] = useState('All Request Statuses');
  const [requests, setRequests] = useState<any[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRequests = async () => {
    try {
      const res = await fetch('/api/v1/rbac/club/robotics_club_demo/requests', {
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.requests)) setRequests(json.requests);
      }
    } catch {
      // ignore initial error
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleCancel = async (requestId: string) => {
    try {
      const res = await fetch(
        `/api/v1/rbac/club/robotics_club_demo/requests/${encodeURIComponent(requestId)}/cancel`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );
      if (res.ok) {
        setNotice(`Booking request ${requestId} cancelled.`);
        await loadRequests();
      }
    } catch {
      setNotice('Failed to cancel booking request.');
    }
  };

  const approvedCount = requests.filter((r) => String(r.status || '').toUpperCase() === 'APPROVED').length;
  const altCount = requests.filter((r) => String(r.status || '').toUpperCase() === 'ALTERNATIVE_OFFERED').length;
  const rejectedOrCancelledCount = requests.filter(
    (r) => ['REJECTED', 'CANCELLED'].includes(String(r.status || '').toUpperCase())
  ).length;

  return (
    <RoleWorkspaceLayout
      title="My Venue Requests"
      subtitle="Track the approval status, assigned rooms, and alternative venue offers for your student club."
      breadcrumbCurrent="My Venue Requests"
      headerActions={
        <Link
          to="/club/submit-venue-request"
          className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-4 py-2 text-xs font-semibold text-white hover:bg-[#294074]"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Submit New Venue Request
        </Link>
      }
    >
      <div className="space-y-6" data-testid="club-my-venue-requests-screen">
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

        {/* Status Summary Cards */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'SUBMITTED REQUESTS', value: String(requests.length) },
            { label: 'APPROVED VENUES', value: String(approvedCount) },
            { label: 'ALTERNATIVE OFFERED', value: String(altCount) },
            { label: 'REJECTED / CANCELLED', value: String(rejectedOrCancelledCount) },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                {item.label}
              </div>
              <div className="mt-1 text-xl font-bold text-[#132957]">
                {item.value}
              </div>
            </div>
          ))}
        </section>

        {/* Club Request Ledger */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF2F8] pb-3.5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Club Venue Request History ({requests.length})
              </h2>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#182238]"
            >
              <option>All Request Statuses</option>
              <option>Pending Evaluation</option>
              <option>Approved</option>
              <option>Alternative Offered</option>
              <option>Rejected</option>
            </select>
          </div>

          {requests.length === 0 ? (
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center">
              <FileText className="mx-auto h-7 w-7 text-[#64748B] mb-2" />
              <div className="text-sm font-bold text-[#132957]">
                No Club Venue Requests Submitted Yet
              </div>
              <p className="mt-1 text-xs text-[#64748B] max-w-md mx-auto">
                Venue requests submitted by your club representative account will appear here along with deterministic constraint explanations and any alternative room offers.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                    <th className="py-2 pr-3">ID</th>
                    <th className="py-2 px-3">Event Title</th>
                    <th className="py-2 px-3">Attendance</th>
                    <th className="py-2 px-3">Assigned Slot &amp; Venue</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 pl-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF2F8]">
                  {requests.map((r) => {
                    const upperStatus = String(r.status || 'PENDING').toUpperCase();
                    return (
                      <tr key={r.requestId}>
                        <td className="py-2.5 pr-3 font-mono font-bold text-[#132957]">{r.requestId}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-[#182238]">{r.title}</div>
                          <div className="text-[11px] text-[#64748B]">{r.decisionReason || r.explanation}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono">{r.attendance}</td>
                        <td className="py-2.5 px-3 font-mono">
                          {r.allocatedSlot
                            ? `${r.allocatedSlot} · ${r.allocatedRoom || '—'}`
                            : `${r.dayWindow || '—'} · ${r.allocatedRoom || r.requestedRoom || '—'}`}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                              upperStatus === 'APPROVED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : upperStatus === 'CANCELLED' || upperStatus === 'REJECTED'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {upperStatus}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3">
                          {upperStatus !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => handleCancel(r.requestId)}
                              className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                            >
                              <XCircle className="h-3 w-3" />
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-2 pt-3 border-t border-[#EEF2F8] text-xs text-[#64748B]">
            <ShieldCheck className="h-4 w-4 text-[#132957]" />
            <span>
              Club Representatives can view and manage only their own club’s venue booking requests.
            </span>
          </div>
        </section>
      </div>
    </RoleWorkspaceLayout>
  );
}

