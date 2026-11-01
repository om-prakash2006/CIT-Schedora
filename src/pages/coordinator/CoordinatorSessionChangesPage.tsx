import React, { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

export function CoordinatorSessionChangesPage() {
  const [statusFilter, setStatusFilter] = useState('All Department Requests');
  const [requests, setRequests] = useState<any[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRequests = async () => {
    try {
      const res = await fetch('/api/v1/rbac/coordinator/departments/CSE/session-changes', {
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

  const handleDecision = async (requestId: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await fetch(
        `/api/v1/rbac/coordinator/departments/CSE/session-changes/${encodeURIComponent(requestId)}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            decision,
            rationale:
              decision === 'APPROVED'
                ? 'Endorsed by CSE Coordinator after zero cohort clash check'
                : 'Rejected due to departmental schedule overlap',
          }),
        }
      );
      if (res.ok) {
        setNotice(`Request ${requestId} ${decision.toLowerCase()} and logged in audit trail.`);
        await loadRequests();
      }
    } catch {
      setNotice('Failed to record coordinator decision.');
    }
  };

  const pendingCount = requests.filter((r) => r.status === 'PENDING_COORDINATOR_REVIEW').length;
  const endorsedCount = requests.filter(
    (r) => r.status === 'ENDORSED_TO_DEAN' || r.status === 'APPROVED'
  ).length;

  return (
    <RoleWorkspaceLayout
      title="Session Change Requests"
      subtitle="Review faculty session relocation proposals, makeup tutorial requests, and unavailability endorsements within your department."
      breadcrumbCurrent="Session Change Requests"
    >
      <div className="space-y-6" data-testid="coordinator-session-changes-screen">
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

        {/* Summary Bar */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              PENDING COORDINATOR REVIEW
            </div>
            <div className="mt-1 text-xl font-bold text-[#132957]">{pendingCount}</div>
            <div className="mt-0.5 text-xs text-[#64748B]">
              Awaiting faculty submissions
            </div>
          </div>

          <div className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              ENDORSED TO DEAN’S OFFICE
            </div>
            <div className="mt-1 text-xl font-bold text-[#132957]">{endorsedCount}</div>
            <div className="mt-0.5 text-xs text-[#64748B]">
              Pre-validated for zero cohort clash
            </div>
          </div>

          <div className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              DETERMINISTIC FEASIBILITY GATE
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-[#132957]">
              <CheckCircle2 className="h-4 w-4 text-[#294074]" />
              <span>Active</span>
            </div>
            <div className="mt-0.5 text-xs text-[#64748B]">
              Verifies student group &amp; room availability
            </div>
          </div>
        </section>

        {/* Request Queue */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF2F8] pb-3.5">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Departmental Session Change Queue ({requests.length})
              </h2>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#182238]"
            >
              <option>All Department Requests</option>
              <option>Session Relocation</option>
              <option>Faculty Unavailability</option>
              <option>Additional Session Request</option>
            </select>
          </div>

          {requests.length === 0 ? (
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center">
              <Clock className="mx-auto h-7 w-7 text-[#64748B] mb-2" />
              <div className="text-sm font-bold text-[#132957]">
                No Pending Session Change Requests
              </div>
              <p className="mt-1 text-xs text-[#64748B] max-w-md mx-auto">
                When faculty members in your department submit session relocation or additional session requests, they appear here with deterministic clash analysis prior to Dean’s Office sign-off.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.requestId}
                  className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 flex flex-wrap items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#132957]">{req.requestId}</span>
                      <span className="rounded bg-[#E8EFFA] px-2 py-0.5 text-[10px] font-bold text-[#132957]">
                        {req.requestType}
                      </span>
                      <span className="font-semibold text-[#182238]">
                        {req.facultyName} ({req.facultyId}) · {req.courseCode}
                      </span>
                    </div>
                    <div className="text-[#475569]">
                      Current: <span className="font-mono">{req.currentSlot}</span> → Proposed:{' '}
                      <span className="font-mono font-semibold text-[#132957]">{req.proposedSlot}</span>
                    </div>
                    <div className="text-[11px] text-[#64748B]">Reason: {req.reason}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2.5 py-1 text-[10px] font-bold uppercase ${
                        req.status === 'PENDING_COORDINATOR_REVIEW'
                          ? 'bg-amber-50 text-amber-800'
                          : req.status === 'REJECTED'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {req.status}
                    </span>
                    {req.status === 'PENDING_COORDINATOR_REVIEW' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDecision(req.requestId, 'APPROVED')}
                          className="rounded-lg bg-[#132957] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#294074] cursor-pointer"
                        >
                          Endorse
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDecision(req.requestId, 'REJECTED')}
                          className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-3 border-t border-[#EEF2F8] text-xs text-[#64748B]">
            <ShieldCheck className="h-4 w-4 text-[#132957]" />
            <span>
              Coordinator endorsement verifies departmental teaching continuity; final master timetable mutation requires Admin approval.
            </span>
          </div>
        </section>
      </div>
    </RoleWorkspaceLayout>
  );
}

