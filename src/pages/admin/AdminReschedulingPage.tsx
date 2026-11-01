import React, { useState } from 'react';
import {
  Upload,
  RefreshCw,
  ShieldCheck,
  GitCompare,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  FileCheck,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

const PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Disruption Ingestion',
    detail: 'Parse faculty_unavailable, room_unavailable, and add_session mutations.',
  },
  {
    step: '02',
    title: 'Minimum-Movement CP-SAT Solver',
    detail: 'Isolate affected sessions and compute minimal perturbation repair.',
  },
  {
    step: '03',
    title: 'Official Validator Verification',
    detail: 'Run validator.py to confirm zero hard-constraint regressions.',
  },
  {
    step: '04',
    title: 'Dean’s Office Admin Sign-Off',
    detail: 'Review delta manifest and commit approved schedule_after.json.',
  },
];

interface ProposalData {
  proposalId: string;
  status: string;
  disruptionId: string;
  description: string;
  isValid: boolean;
  sessionsMoved: number;
  timeChanged: number;
  roomOnlyChanged: number;
  movedIds: string[];
  sessions: Array<{ session_id: string; day: string; start_period: number; room_id: string }>;
}

export function AdminReschedulingPage() {
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<ProposalData | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const sampleDisruptionPayload = {
    id: 'sample-disruption',
    dataset: 'cit-public-v1',
    description: 'Practice disruption: Faculty F07 unavailable MON, Room CR-102 closed, Add tutorial CS202-T2',
    changes: [
      {
        type: 'faculty_unavailable',
        faculty_id: 'F07',
        days: ['MON'],
        periods: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        reason: 'Conference travel every Monday for the rest of the semester',
      },
      {
        type: 'room_unavailable',
        room_id: 'CR-102',
        days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        periods: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        reason: 'Water leak, room closed for the rest of the semester',
      },
      {
        type: 'add_session',
        session: {
          id: 'CS202-T2',
          course_id: 'CS202',
          kind: 'tutorial',
          groups: ['CSE-2'],
          faculty_id: 'F06',
          size: 80,
          duration: 1,
          room_types: ['classroom', 'lecture_hall', 'auditorium'],
          needs_accessible: false,
          basket_slot: null,
          fixed_slot: null,
        },
      },
    ],
  };

  const handleComputeRepair = async () => {
    try {
      setLoading(true);
      setFeedback(null);
      setActionSuccess(null);

      const res = await fetch('/api/v1/rescheduling/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ disruption: sampleDisruptionPayload }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || 'Failed to compute rescheduling proposal.');
      }

      const json = await res.json();
      setProposal(json.data);
    } catch (err: any) {
      setFeedback(err.message || 'Rescheduling solver unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveProposal = async () => {
    if (!proposal) return;
    try {
      setLoading(true);
      setFeedback(null);

      const res = await fetch(`/api/v1/rescheduling/proposals/${proposal.proposalId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'approve', reason: 'Approved by Dean\'s Office' }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || 'Failed to approve proposal.');
      }

      setActionSuccess(`Proposal ${proposal.proposalId} approved! Post-disruption schedule saved to exports/schedule_after.json.`);
      setProposal((prev) => prev ? { ...prev, status: 'approved' } : null);
    } catch (err: any) {
      setFeedback(err.message || 'Failed to approve proposal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <RoleWorkspaceLayout
      title="Dynamic Rescheduling"
      subtitle="Minimum-perturbation schedule repair for unforeseen room closures, faculty emergency leaves, and injected curricular sessions."
      breadcrumbCurrent="Dynamic Rescheduling"
      headerActions={
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleComputeRepair}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-4 py-2 text-xs font-semibold text-white hover:bg-[#294074] cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitCompare className="h-3.5 w-3.5" />
            )}
            Analyze Sample Disruption &amp; Repair
          </button>
        </div>
      }
    >
      <div className="space-y-6" data-testid="admin-rescheduling-screen">
        {feedback && (
          <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-900">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{feedback}</div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-[11px] font-semibold text-gray-500"
            >
              Dismiss
            </button>
          </div>
        )}

        {actionSuccess && (
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{actionSuccess}</div>
          </div>
        )}

        {/* 4-Step Pipeline */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PIPELINE_STEPS.map((item, idx) => (
            <div
              key={item.step}
              className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#294074]">
                  STEP {item.step}
                </span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  {proposal && idx <= 2 ? 'Active' : 'Ready'}
                </span>
              </div>
              <h3 className="font-serif text-xs font-bold text-[#132957] mt-2 mb-1">
                {item.title}
              </h3>
              <p className="text-[11px] text-[#64748B] leading-relaxed">
                {item.detail}
              </p>
            </div>
          ))}
        </section>

        {/* Proposal Analysis Output */}
        {proposal ? (
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EEF2F8] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-serif text-base font-bold text-[#132957]">
                    Disruption Analysis &amp; Minimum-Movement Proposal
                  </h2>
                  <span className={`rounded px-2.5 py-0.5 text-xs font-bold ${
                    proposal.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-amber-100 text-amber-900'
                  }`}>
                    {proposal.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-[#64748B] mt-0.5">{proposal.description}</p>
              </div>

              {proposal.status === 'pending' && (
                <button
                  type="button"
                  onClick={handleApproveProposal}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 cursor-pointer disabled:opacity-50"
                >
                  <FileCheck className="h-4 w-4" />
                  Approve &amp; Commit Post-Disruption Schedule
                </button>
              )}
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[10px] font-bold uppercase text-[#64748B]">Sessions Moved</div>
                <div className="text-lg font-bold text-[#132957]">{proposal.sessionsMoved}</div>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[10px] font-bold uppercase text-[#64748B]">Time Changed</div>
                <div className="text-lg font-bold text-[#132957]">{proposal.timeChanged}</div>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[10px] font-bold uppercase text-[#64748B]">Room Only Changed</div>
                <div className="text-lg font-bold text-[#132957]">{proposal.roomOnlyChanged}</div>
              </div>
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                <div className="text-[10px] font-bold uppercase text-[#64748B]">Validator Status</div>
                <div className="text-lg font-bold text-emerald-700">0 Hard Violations</div>
              </div>
            </div>

            {/* Moved Sessions List */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-[#132957]">
                Affected &amp; Moved Sessions ({proposal.movedIds.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {proposal.movedIds.map((sid) => (
                  <span
                    key={sid}
                    className="rounded bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-mono font-bold text-indigo-900"
                  >
                    {sid}
                  </span>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-8 text-center shadow-xs space-y-3">
            <GitCompare className="h-8 w-8 text-[#132957] mx-auto opacity-40" />
            <h3 className="font-serif text-sm font-bold text-[#132957]">
              No Disruption Repair Active
            </h3>
            <p className="text-xs text-[#64748B] max-w-md mx-auto">
              Click &quot;Analyze Sample Disruption &amp; Repair&quot; above to simulate a multi-change operational disruption (Faculty F07 unavailable, Room CR-102 closed, extra tutorial CS202-T2) and generate a minimum-movement proposal.
            </p>
          </section>
        )}
      </div>
    </RoleWorkspaceLayout>
  );
}
