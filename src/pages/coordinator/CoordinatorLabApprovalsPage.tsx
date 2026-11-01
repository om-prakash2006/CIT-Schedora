import React, { useEffect, useState } from 'react';
import {
  FlaskConical,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

export function CoordinatorLabApprovalsPage() {
  const [labFilter, setLabFilter] = useState('All Departmental Laboratories');
  const [approvals, setApprovals] = useState<any[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const loadApprovals = async () => {
    try {
      const res = await fetch('/api/v1/rbac/coordinator/departments/CSE/lab-approvals', {
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.approvals)) setApprovals(json.approvals);
      }
    } catch {
      // ignore initial error
    }
  };

  useEffect(() => {
    loadApprovals();
  }, []);

  const handleDecision = async (requestId: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await fetch(
        `/api/v1/rbac/coordinator/departments/CSE/lab-approvals/${encodeURIComponent(requestId)}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            decision,
            rationale:
              decision === 'APPROVED'
                ? 'Verified contiguous lab availability and equipment match'
                : 'Lab equipment conflict',
          }),
        }
      );
      if (res.ok) {
        setNotice(`Lab booking request ${requestId} ${decision.toLowerCase()}.`);
        await loadApprovals();
      }
    } catch {
      setNotice('Failed to record lab approval decision.');
    }
  };

  const pendingCount = approvals.filter((a) => a.status === 'PENDING_APPROVAL').length;

  return (
    <RoleWorkspaceLayout
      title="Lab Booking Approvals"
      subtitle="Approve specialized laboratory reservations, practical makeup blocks, and equipment-matched room requests."
      breadcrumbCurrent="Lab Booking Approvals"
    >
      <div className="space-y-6" data-testid="coordinator-lab-approvals-screen">
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

        {/* Lab Governance Notice */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-[#F0F4FA] p-2 text-[#132957]">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#132957]">
                Specialized Laboratory Equipment &amp; Contiguous Block Rule
              </div>
              <p className="text-xs text-[#64748B] mt-0.5">
                Practical sessions and laboratory bookings require exact room-type matching and contiguous multi-period availability without violating the 13:00–14:00 lunch window.
              </p>
            </div>
          </div>

          <select
            value={labFilter}
            onChange={(e) => setLabFilter(e.target.value)}
            className="rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
          >
            <option>All Departmental Laboratories</option>
            <option>Computing &amp; Systems Labs</option>
            <option>Electronics &amp; VLSI Labs</option>
            <option>Mechanical &amp; Robotics Labs</option>
          </select>
        </section>

        {/* Lab Approval Queue */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#EEF2F8] pb-3">
            <h2 className="font-serif text-base font-bold text-[#132957]">
              Pending Laboratory Booking Requests
            </h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#132957]">
              <CheckCircle2 className="h-4 w-4 text-[#294074]" />
              {pendingCount} Pending Approvals
            </span>
          </div>

          {approvals.length === 0 ? (
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center">
              <FlaskConical className="mx-auto h-7 w-7 text-[#64748B] mb-2" />
              <div className="text-sm font-bold text-[#132957]">
                No Laboratory Booking Requests Pending Approval
              </div>
              <p className="mt-1 text-xs text-[#64748B] max-w-md mx-auto">
                Requests for departmental laboratories will appear here once submitted by faculty or generated from an active institutional dataset.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {approvals.map((item) => (
                <div
                  key={item.requestId}
                  className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 flex flex-wrap items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#132957]">{item.requestId}</span>
                      <span className="font-semibold text-[#182238]">{item.title}</span>
                    </div>
                    <div className="text-[#475569]">
                      Room: <span className="font-mono font-bold text-[#132957]">{item.roomId}</span> ({item.roomType}) · Window:{' '}
                      <span className="font-mono">{item.window}</span> · Attendance: {item.attendance}
                    </div>
                    <div className="text-[11px] text-[#64748B]">
                      Requested by: {item.requestedBy} · Equipment: {(item.equipment || []).join(', ')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2.5 py-1 text-[10px] font-bold uppercase ${
                        item.status === 'APPROVED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : item.status === 'REJECTED'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {item.status}
                    </span>
                    {item.status === 'PENDING_APPROVAL' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDecision(item.requestId, 'APPROVED')}
                          className="rounded-lg bg-[#132957] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#294074] cursor-pointer"
                        >
                          Approve Lab
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDecision(item.requestId, 'REJECTED')}
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
              Non-lab courses cannot be assigned to specialized laboratory venues unless explicitly authorized by hard-constraint rules.
            </span>
          </div>
        </section>
      </div>
    </RoleWorkspaceLayout>
  );
}

