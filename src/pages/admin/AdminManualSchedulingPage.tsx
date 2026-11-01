import React, { useState } from 'react';
import {
  Wrench,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

interface ValidationResult {
  isValid: boolean;
  sessionId: string;
  day: string;
  startPeriod: number;
  endPeriod: number;
  roomId: string;
  violations: string[];
}

export function AdminManualSchedulingPage() {
  const [sessionId, setSessionId] = useState('CS202-L1');
  const [day, setDay] = useState<'MON' | 'TUE' | 'WED' | 'THU' | 'FRI'>('MON');
  const [startPeriod, setStartPeriod] = useState<number>(1);
  const [roomId, setRoomId] = useState('LH-1');

  const [loading, setLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleValidate = async () => {
    try {
      setLoading(true);
      setFeedback(null);
      setValidationResult(null);

      const res = await fetch('/api/v1/manual-scheduling/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId,
          day,
          startPeriod,
          roomId,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || 'Validation failed.');
      }

      const json = await res.json();
      setValidationResult(json.data);
      if (json.data.isValid) {
        setFeedback({
          type: 'success',
          message: `Manual assignment for ${sessionId} on ${day} P${startPeriod} in ${roomId} passed all official hard constraints!`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: 'Manual assignment violates official hard constraints. See validation errors below.',
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to validate assignment.' });
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    try {
      setLoading(true);
      setFeedback(null);

      const res = await fetch('/api/v1/manual-scheduling/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId,
          day,
          startPeriod,
          roomId,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || 'Apply failed.');
      }

      setFeedback({
        type: 'success',
        message: `Manual assignment for ${sessionId} applied successfully and committed to audit log.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to apply manual assignment.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <RoleWorkspaceLayout
      title="Manual Scheduling"
      subtitle="Administrative slot allocation and overrides with mandatory deterministic feasibility verification."
      breadcrumbCurrent="Manual Scheduling"
    >
      <div className="space-y-6" data-testid="admin-manual-scheduling-screen">
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EEF2F8] pb-3">
              <Wrench className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Manual Session Override Parameters
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                  SESSION IDENTIFIER
                </label>
                <input
                  type="text"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  placeholder="e.g. CS202-L1"
                  className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                  TARGET DAY
                </label>
                <select
                  value={day}
                  onChange={(e) => setDay(e.target.value as any)}
                  className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
                >
                  <option value="MON">Monday</option>
                  <option value="TUE">Tuesday</option>
                  <option value="WED">Wednesday</option>
                  <option value="THU">Thursday</option>
                  <option value="FRI">Friday</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                  START PERIOD (P1–P9)
                </label>
                <select
                  value={startPeriod}
                  onChange={(e) => setStartPeriod(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => (
                    <option key={p} value={p}>P{p} ({String(7 + p).padStart(2, '0')}:00–{String(8 + p).padStart(2, '0')}:00)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                  TARGET ROOM CODE
                </label>
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="e.g. LH-1, CR-101"
                  className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleValidate}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-4 py-2 text-xs font-bold text-white hover:bg-[#294074] cursor-pointer disabled:opacity-50"
              >
                {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Validate Hard Constraints
              </button>

              {validationResult?.isValid && (
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 cursor-pointer disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Apply Manual Assignment
                </button>
              )}
            </div>
          </section>

          {/* Validation Feedback Details */}
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EEF2F8] pb-3">
              <ShieldCheck className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Deterministic Hard Constraint Gate
              </h2>
            </div>

            {validationResult ? (
              <div className="space-y-3">
                <div className={`p-3 rounded-lg border text-xs font-bold flex items-center gap-2 ${
                  validationResult.isValid
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                  {validationResult.isValid ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-600" />
                  )}
                  {validationResult.isValid
                    ? 'VALID: All hard constraints satisfied (H1–H13)'
                    : 'INVALID: Hard constraint violations detected'}
                </div>

                {!validationResult.isValid && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold uppercase text-[#64748B]">Violation Traces:</div>
                    {validationResult.violations.map((v, idx) => (
                      <div key={idx} className="p-2.5 rounded border border-rose-200 bg-rose-50/50 text-xs text-rose-900 font-mono">
                        {v}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#64748B] leading-relaxed">
                Click &quot;Validate Hard Constraints&quot; to verify session completeness, room capacity, room type matching, faculty unavailability, room unavailability, and period restrictions before committing manual changes.
              </p>
            )}
          </section>
        </div>
      </div>
    </RoleWorkspaceLayout>
  );
}
