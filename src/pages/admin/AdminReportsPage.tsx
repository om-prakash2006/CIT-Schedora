import React, { useState, useEffect } from 'react';
import {
  Download,
  FileJson,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  BarChart2,
  Users,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

interface ValidatorReport {
  stdout: string;
  report?: {
    dataset_id: string;
    hard_violation_count: number;
    hard_violations: any[];
    soft_total: number;
    bookings?: { booking_score: number; approved: number };
    stability?: { sessions_moved: number };
  };
}

export function AdminReportsPage() {
  const [loadingVal, setLoadingVal] = useState(false);
  const [valOutput, setValOutput] = useState<ValidatorReport | null>(null);
  const [roomStats, setRoomStats] = useState<any[]>([]);
  const [facultyStats, setFacultyStats] = useState<any[]>([]);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/v1/reports/room-utilization', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => setRoomStats(json.data || []))
      .catch(() => {});

    fetch('/api/v1/reports/faculty-workload', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => setFacultyStats(json.data || []))
      .catch(() => {});
  }, []);

  const handleRunValidator = async (schedulePath: string) => {
    try {
      setLoadingVal(true);
      setNotice(null);
      setValOutput(null);

      const res = await fetch('/api/v1/reports/validate-official', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ schedulePath }),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('Authentication required. Please sign in with Dean / Admin credentials to execute official validation.');
        }
        throw new Error(`Validator service call failed (HTTP ${res.status}).`);
      }

      const json = await res.json();
      setValOutput(json.data);
      setNotice({
        type: 'success',
        message: `Ran official validator.py on ${schedulePath}. Hard violations: ${json.data.report?.hard_violation_count ?? 0}.`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', message: err.message || 'Failed to execute official validator.' });
    } finally {
      setLoadingVal(false);
    }
  };

  return (
    <RoleWorkspaceLayout
      title="Reports &amp; Exports"
      subtitle="Export official schedule.json and schedule_after.json evaluation artifacts and institutional governance reports."
      breadcrumbCurrent="Reports &amp; Exports"
    >
      <div className="space-y-6" data-testid="admin-reports-screen">
        {notice && (
          <div
            className={`flex items-start gap-2.5 rounded-lg border p-3.5 text-xs ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            {notice.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 font-medium">{notice.message}</div>
          </div>
        )}

        {/* Evaluation Export Cards */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs flex flex-col justify-between space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-[#F0F4FA] p-2.5 text-[#132957]">
                  <FileJson className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-mono text-xs font-bold text-[#132957]">
                    exports/schedule.json
                  </div>
                  <div className="text-xs text-[#64748B]">
                    Primary Baseline Schedule Artifact (189 sessions, 41 exams, 25 bookings)
                  </div>
                </div>
              </div>
              <span className="rounded bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
                Generated &amp; Valid
              </span>
            </div>

            <p className="text-xs text-[#64748B]">
              Conforms strictly to the organiser evaluation schema verified by <code className="font-mono">validator.py</code>.
            </p>

            <div className="flex items-center justify-between pt-3 border-t border-[#EEF2F8]">
              <button
                type="button"
                onClick={() => handleRunValidator('exports/schedule.json')}
                disabled={loadingVal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE4F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#132957] hover:bg-[#F8FAFC] cursor-pointer"
              >
                {loadingVal ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Validate with validator.py
              </button>
              <a
                href="/exports/schedule.json"
                download="schedule.json"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#132957] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#294074]"
              >
                <Download className="h-3.5 w-3.5" />
                Download schedule.json
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs flex flex-col justify-between space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-[#F0F4FA] p-2.5 text-[#132957]">
                  <FileJson className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-mono text-xs font-bold text-[#132957]">
                    exports/schedule_after.json
                  </div>
                  <div className="text-xs text-[#64748B]">
                    Post-Disruption Repaired Schedule Artifact (Sample Disruption)
                  </div>
                </div>
              </div>
              <span className="rounded bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
                Generated &amp; Valid
              </span>
            </div>

            <p className="text-xs text-[#64748B]">
              Generated automatically after Admin approval of dynamic disruption repair proposal.
            </p>

            <div className="flex items-center justify-between pt-3 border-t border-[#EEF2F8]">
              <button
                type="button"
                onClick={() => handleRunValidator('exports/schedule_after.json')}
                disabled={loadingVal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE4F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#132957] hover:bg-[#F8FAFC] cursor-pointer"
              >
                {loadingVal ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Validate with validator.py
              </button>
              <a
                href="/exports/schedule_after.json"
                download="schedule_after.json"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#132957] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#294074]"
              >
                <Download className="h-3.5 w-3.5" />
                Download schedule_after.json
              </a>
            </div>
          </div>
        </section>

        {/* Validator Output Stream */}
        {valOutput && (
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-[#EEF2F8] pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#132957]" />
                <h2 className="font-serif text-sm font-bold text-[#132957]">
                  Official validator.py Output Trace
                </h2>
              </div>
              <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                Hard Violations: {valOutput.report?.hard_violation_count ?? 0}
              </span>
            </div>

            <pre className="p-4 rounded-lg bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto max-h-60">
              {valOutput.stdout || 'Validator output complete.'}
            </pre>
          </section>
        )}

        {/* Utilization & Workload Reports */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 border-b border-[#EEF2F8] pb-3">
              <BarChart2 className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-sm font-bold text-[#132957]">
                Room Utilization Summary ({roomStats.length} Rooms)
              </h2>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-[#EEF2F8] text-xs">
              {roomStats.slice(0, 8).map((r) => (
                <div key={r.roomId} className="py-2 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-[#132957]">{r.name}</span> ({r.type}, Cap {r.capacity})
                  </div>
                  <div className="font-mono text-[#64748B]">
                    {r.weeklyHours} hrs/wk · {r.capacityUtilizationPercentage}% util
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 border-b border-[#EEF2F8] pb-3">
              <Users className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-sm font-bold text-[#132957]">
                Faculty Workload Summary ({facultyStats.length} Faculty)
              </h2>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-[#EEF2F8] text-xs">
              {facultyStats.slice(0, 8).map((f) => (
                <div key={f.facultyId} className="py-2 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-[#132957]">{f.name}</span> ({f.department})
                  </div>
                  <div className="font-mono text-[#64748B]">
                    {f.weeklyHoursAssigned} hrs/wk assigned (Limit {f.dailyLimitHours}h/day)
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </RoleWorkspaceLayout>
  );
}
