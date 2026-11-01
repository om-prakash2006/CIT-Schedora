import React, { useState } from 'react';
import {
  Settings,
  ShieldCheck,
  Lock,
  Scale,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';
import { CIT_CREST_URL } from '../../components/navigation/navigationConfig.ts';

const PRIORITY_TIERS = [
  { tier: 'Tier 1 (Highest)', name: 'Statutory Examinations', rule: 'Locks rooms at 50% effective seating capacity; preempts all non-exam events.' },
  { tier: 'Tier 2', name: 'Regular Curricular Classes & Labs', rule: 'Protected daytime academic teaching schedule (P1–P9).' },
  { tier: 'Tier 3', name: 'Remedial & Makeup Academic Sessions', rule: 'Allocated into verified clash-free slots for target student group and faculty.' },
  { tier: 'Tier 4', name: 'Department Academic Seminars & Workshops', rule: 'Requires Department Coordinator endorsement within department venue scope.' },
  { tier: 'Tier 5', name: 'Spectra Week Flagship Festival Events', rule: 'Prioritizes P10–P13 evening slots; daytime displacement requires pre-verified class relocation.' },
  { tier: 'Tier 6 (Capped)', name: 'Student Club Activities & Orientations', rule: 'Strictly non-preemptive; allocated only into open non-instructional venue slots.' },
];

const HARD_INVARIANTS = [
  'Mandatory Daily Lunch Protection Window: 13:00 – 14:00 (Locked across all campus venues)',
  'Examination Effective Capacity Rule: Strictly capped at 50% of rated room seating capacity',
  'Zero Cohort / Faculty / Room Double-Booking Invariant verified by official validator.py',
  'Club Representative Priority Cap: Maximum Priority Tier 6 (Non-preemptive)',
  'Deterministic Validation Gate: No LLM or manual proposal mutates live schedules without validator pass',
];

export function AdminSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleDemoReset = async () => {
    if (!window.confirm('Are you sure you want to reset dynamic operational data? Active dataset (cit-public-v1) and demo logins will remain intact.')) {
      return;
    }

    try {
      setLoading(true);
      setFeedback(null);

      const res = await fetch('/api/v1/admin/demo-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || 'Demo reset failed.');
      }

      const json = await res.json();
      setFeedback({
        type: 'success',
        message: json.data?.message || 'Demo operational state reset successfully.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to reset demo state.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <RoleWorkspaceLayout
      title="Institutional Settings"
      subtitle="Governance parameters, 6-tier booking priority hierarchy, and immutable scheduling invariants for Chilika Institute of Technology."
      breadcrumbCurrent="Settings"
    >
      <div className="space-y-6" data-testid="admin-settings-screen">
        {feedback && (
          <div
            className={`flex items-start gap-2.5 rounded-lg border p-3.5 text-xs ${
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 font-medium">{feedback.message}</div>
          </div>
        )}

        {/* Institutional Identity Card */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-xl border border-[#DCE4F0] bg-[#FFFDF8] p-1.5 flex items-center justify-center">
              <img
                src={CIT_CREST_URL}
                alt="Chilika Institute of Technology Crest"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#294074]">
                INSTITUTIONAL IDENTITY
              </div>
              <h2 className="font-serif text-lg font-bold text-[#132957]">
                Chilika Institute of Technology (CIT)
              </h2>
              <p className="text-xs text-[#64748B]">
                CIT Schedora · Central Campus Scheduling, Examination &amp; Venue Governance Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded bg-[#FBEFA3] px-3 py-1 text-xs font-bold text-[#182238]">
              Academic Horizon: Mon–Sat
            </span>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Priority Hierarchy */}
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EEF2F8] pb-3">
              <Scale className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Six-Tier Booking Priority Hierarchy &amp; Preemption Law
              </h2>
            </div>

            <div className="space-y-2.5">
              {PRIORITY_TIERS.map((pt) => (
                <div
                  key={pt.tier}
                  className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-[#132957]">
                    <span>{pt.name}</span>
                    <span className="font-mono text-[11px] text-[#294074]">
                      {pt.tier}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#64748B]">{pt.rule}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Hard Invariants & Demo Reset */}
          <div className="space-y-6">
            <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-[#EEF2F8] pb-3">
                <ShieldCheck className="h-4 w-4 text-[#132957]" />
                <h2 className="font-serif text-base font-bold text-[#132957]">
                  Scheduling Configuration &amp; 5 Invariant Hard Rules
                </h2>
              </div>

              <ul className="space-y-2.5">
                {HARD_INVARIANTS.map((rule) => (
                  <li
                    key={rule}
                    className="flex items-start gap-2.5 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs text-[#182238]"
                  >
                    <Lock className="h-3.5 w-3.5 text-[#132957] shrink-0 mt-0.5" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-[#132957]" />
                  <h2 className="font-serif text-base font-bold text-[#132957]">
                    Security &amp; Evaluation Sandbox Controls
                  </h2>
                </div>
                <span className="rounded bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-semibold text-[#475569]">
                  Safe Admin Reset
                </span>
              </div>
              <p className="text-xs text-[#64748B]">
                Resets dynamic proposal and decision run collections to clean state. Active dataset (`cit-public-v1`), system configuration, and demo logins remain 100% intact.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleDemoReset}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-900 hover:bg-rose-100 cursor-pointer disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Reset Evaluation Sandbox Operational State
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </RoleWorkspaceLayout>
  );
}
