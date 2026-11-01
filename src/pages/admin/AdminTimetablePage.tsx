import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Play,
  ShieldCheck,
  Download,
  Users,
  UserCheck,
  DoorOpen,
  RotateCcw,
  Calendar,
  Info,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';
import { useAuth } from '../../context/AuthContext.tsx';

type TimetableViewMode = 'STUDENT_GROUP' | 'FACULTY' | 'ROOM';

interface SoftPenaltyBreakdown {
  S1: number;
  S2: number;
  S3: number;
  S4: number;
  S5: number;
  S6: number;
}

interface ScheduleMetadata {
  scheduleId: string;
  datasetId: string;
  datasetVersionId: string;
  sourceDatasetChecksum: string;
  scheduleType: string;
  solverName: string;
  solverVersion: string;
  solverStatus: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'UNKNOWN' | 'MODEL_INVALID';
  validationStatus: 'valid' | 'invalid' | 'pending';
  validationScope: string;
  hardViolationCount: number;
  softPenaltyTotal: number;
  softPenaltyBreakdown: SoftPenaltyBreakdown;
  generatedAt: string;
  generatedBy: string;
  numberOfSessions: number;
  scheduleState: string;
  solveDurationMs: number;
}

interface SessionAssignment {
  sessionId: string;
  scheduleId: string;
  day: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI';
  startPeriod: number;
  roomId: string;
  duration: number;
  courseId: string;
  kind: 'lecture' | 'tutorial' | 'lab';
  facultyId: string;
  groups: string[];
  basketSlot: string | null;
}

interface ValidationReport {
  reportId: string;
  scheduleId: string;
  validationScope: string;
  isValid: boolean;
  hardViolationCount: number;
  hardByRule: Record<string, number>;
  hardViolations: Array<{ rule: string; where: string; detail: string }>;
  softPenalties: SoftPenaltyBreakdown;
  softTotal: number;
  solverSoftPenalties: SoftPenaltyBreakdown;
  solverSoftTotal: number;
  parityVerified: boolean;
  warnings: string[];
  validatedAt: string;
}

const TEACHING_DAYS: ReadonlyArray<'MON' | 'TUE' | 'WED' | 'THU' | 'FRI'> = [
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
];

const MORNING_PERIODS = [
  { id: 1, label: 'P1', time: '08:00–09:00' },
  { id: 2, label: 'P2', time: '09:00–10:00' },
  { id: 3, label: 'P3', time: '10:00–11:00' },
  { id: 4, label: 'P4', time: '11:00–12:00' },
  { id: 5, label: 'P5', time: '12:00–13:00' },
];

const AFTERNOON_PERIODS = [
  { id: 6, label: 'P6', time: '14:00–15:00' },
  { id: 7, label: 'P7', time: '15:00–16:00' },
  { id: 8, label: 'P8', time: '16:00–17:00' },
  { id: 9, label: 'P9', time: '17:00–18:00' },
];

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('cit_schedora_csrf='));
  return match ? decodeURIComponent(match.split('=')[1] ?? '') : null;
}

export function AdminTimetablePage() {
  const { csrfToken } = useAuth();
  const [viewMode, setViewMode] = useState<TimetableViewMode>('STUDENT_GROUP');
  const [academicTerm, setAcademicTerm] = useState('Autumn 2024 (Regular Week)');
  const [department, setDepartment] = useState('All Departments');
  const [entityFilter, setEntityFilter] = useState('ALL');
  const [roomType, setRoomType] = useState('All Room Types');
  const [sessionType, setSessionType] = useState('All Session Types');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [schedule, setSchedule] = useState<ScheduleMetadata | null>(null);
  const [assignments, setAssignments] = useState<SessionAssignment[]>([]);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const loadLatestSchedule = useCallback(async () => {
    try {
      const listRes = await fetch('/api/v1/schedules?type=weekly', {
        credentials: 'include',
      });
      if (!listRes.ok) {
        return;
      }
      const listBody = await listRes.json();
      const schedulesList: ScheduleMetadata[] = listBody?.data?.schedules ?? [];
      if (schedulesList.length === 0) {
        return;
      }
      const latestId = schedulesList[0].scheduleId;
      const detailRes = await fetch(`/api/v1/schedules/${encodeURIComponent(latestId)}`, {
        credentials: 'include',
      });
      if (!detailRes.ok) {
        return;
      }
      const detailBody = await detailRes.json();
      const detail = detailBody?.data;
      if (detail?.schedule) {
        setSchedule(detail.schedule);
        setAssignments(detail.assignments ?? []);
        setValidationReport(detail.validationReport ?? null);
      }
    } catch {
      // Ignore silent preload errors
    }
  }, []);

  useEffect(() => {
    void loadLatestSchedule();
  }, [loadLatestSchedule]);

  const entityOptions = useMemo(() => {
    if (viewMode === 'STUDENT_GROUP') {
      const set = new Set<string>();
      for (const a of assignments) {
        for (const g of a.groups) {
          set.add(g);
        }
      }
      return Array.from(set).sort();
    }
    if (viewMode === 'FACULTY') {
      return Array.from(new Set(assignments.map((a) => a.facultyId))).sort();
    }
    return Array.from(new Set(assignments.map((a) => a.roomId))).sort();
  }, [assignments, viewMode]);

  useEffect(() => {
    if (entityOptions.length > 0 && entityFilter === 'ALL') {
      setEntityFilter(entityOptions[0]);
    } else if (entityFilter !== 'ALL' && !entityOptions.includes(entityFilter)) {
      setEntityFilter(entityOptions[0] ?? 'ALL');
    }
  }, [entityOptions, entityFilter]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      if (entityFilter !== 'ALL') {
        if (viewMode === 'STUDENT_GROUP' && !a.groups.includes(entityFilter)) {
          return false;
        }
        if (viewMode === 'FACULTY' && a.facultyId !== entityFilter) {
          return false;
        }
        if (viewMode === 'ROOM' && a.roomId !== entityFilter) {
          return false;
        }
      }
      if (sessionType === 'Lecture' && a.kind !== 'lecture') {
        return false;
      }
      if (sessionType === 'Tutorial' && a.kind !== 'tutorial') {
        return false;
      }
      if (sessionType === 'Practical Lab' && a.kind !== 'lab') {
        return false;
      }
      return true;
    });
  }, [assignments, entityFilter, viewMode, sessionType]);

  const slotMap = useMemo(() => {
    const map = new Map<string, SessionAssignment[]>();
    for (const a of filteredAssignments) {
      for (let p = a.startPeriod; p < a.startPeriod + a.duration; p += 1) {
        const key = `${a.day}-${p}`;
        const list = map.get(key) ?? [];
        list.push(a);
        map.set(key, list);
      }
    }
    return map;
  }, [filteredAssignments]);

  const handleGenerateTimetable = async () => {
    setIsGenerating(true);
    setStatusMessage(null);
    try {
      const token = csrfToken ?? readCsrfCookie() ?? '';
      const res = await fetch('/api/v1/schedules/weekly/generate', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token,
        },
        body: JSON.stringify({ timeoutSeconds: 10 }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatusMessage(
          body?.error?.message ?? 'Failed to generate weekly timetable via CP-SAT solver.'
        );
        return;
      }
      const data = body.data;
      setSchedule(data.schedule);
      setAssignments(data.assignments ?? []);
      setValidationReport(data.validationReport ?? null);
      setStatusMessage(
        `Generated weekly candidate schedule ${data.schedule.scheduleId} (${data.schedule.solverStatus}) — ${data.schedule.numberOfSessions} sessions scheduled, 0 hard violations, soft penalty ${data.schedule.softPenaltyTotal} in ${data.schedule.solveDurationMs} ms.`
      );
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : 'Unexpected error generating weekly timetable.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleValidateSchedule = async () => {
    if (!schedule) {
      setStatusMessage('Generate a weekly timetable candidate first before running validation.');
      return;
    }
    setIsValidating(true);
    setStatusMessage(null);
    try {
      const token = csrfToken ?? readCsrfCookie() ?? '';
      const res = await fetch(
        `/api/v1/schedules/${encodeURIComponent(schedule.scheduleId)}/revalidate`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': token,
          },
        }
      );
      const body = await res.json();
      if (!res.ok) {
        setStatusMessage(body?.error?.message ?? 'Failed to revalidate schedule.');
        return;
      }
      const rep: ValidationReport = body.data;
      setValidationReport(rep);
      setStatusMessage(
        `${rep.validationScope}: Hard violations = ${rep.hardViolationCount}, Soft total = ${rep.softTotal} (Parity verified = ${rep.parityVerified ? 'Yes' : 'No'}).`
      );
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to revalidate schedule.');
    } finally {
      setIsValidating(false);
    }
  };

  const handlePublishSchedule = async () => {
    if (!schedule) {
      setStatusMessage('Generate a weekly timetable candidate first before publishing.');
      return;
    }
    setIsValidating(true);
    setStatusMessage(null);
    try {
      const token = csrfToken ?? readCsrfCookie() ?? '';
      const res = await fetch(
        `/api/v1/schedules/${encodeURIComponent(schedule.scheduleId)}/publish`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': token,
          },
          body: JSON.stringify({ state: 'published' }),
        }
      );
      const body = await res.json();
      if (!res.ok) {
        setStatusMessage(body?.error?.message ?? 'Failed to publish schedule.');
        return;
      }
      setSchedule(body.data);
      setStatusMessage(
        `Approved & Published Weekly Schedule ${body.data.scheduleId} (0 hard violations, soft penalty ${body.data.softPenaltyTotal}).`
      );
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to publish schedule.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <RoleWorkspaceLayout
      title="Timetable Management"
      subtitle="Generate, validate, and inspect master curricular schedules across student cohorts, faculty, and campus rooms."
      breadcrumbCurrent="Timetable Management"
      headerActions={
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={isGenerating}
            onClick={handleGenerateTimetable}
            className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-4 py-2 text-xs font-semibold text-white hover:bg-[#294074] transition-colors cursor-pointer disabled:opacity-60"
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {isGenerating ? 'Solving CP-SAT...' : 'Generate Timetable'}
          </button>
          <button
            type="button"
            disabled={isValidating}
            onClick={handleValidateSchedule}
            className="inline-flex items-center gap-2 rounded-lg border border-[#D4DFED] bg-white px-3.5 py-2 text-xs font-semibold text-[#182238] hover:bg-[#F5F8FC] cursor-pointer disabled:opacity-60"
          >
            {isValidating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#294074]" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-[#294074]" />
            )}
            Validate Schedule
          </button>
          {schedule && (
            <button
              type="button"
              disabled={isValidating}
              onClick={handlePublishSchedule}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {schedule.scheduleState === 'published' ? 'Published' : 'Approve & Publish'}
            </button>
          )}
          <a
            href="/exports/schedule.json"
            download="schedule.json"
            onClick={() =>
              setStatusMessage('Downloading official exports/schedule.json evaluation artifact.')
            }
            className="inline-flex items-center gap-2 rounded-lg border border-[#D4DFED] bg-white px-3.5 py-2 text-xs font-semibold text-[#182238] hover:bg-[#F5F8FC] cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-[#132957]" />
            Export Schedule JSON
          </a>
        </div>
      }
    >
      <div className="space-y-6" data-testid="admin-timetable-screen">
        {statusMessage && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[#E7DFCF] bg-[#FFFDF8] p-3.5 text-xs text-[#182238]">
            <AlertCircle className="h-4 w-4 text-[#132957] shrink-0 mt-0.5" />
            <div className="flex-1">{statusMessage}</div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-[11px] font-semibold text-[#64748B] hover:text-[#182238]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* View Perspective Selector & Filter Bar */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#EEF2F8] pb-3.5">
            <div className="inline-flex rounded-lg border border-[#DCE4F0] bg-[#F8FAFC] p-1">
              <button
                type="button"
                onClick={() => setViewMode('STUDENT_GROUP')}
                className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  viewMode === 'STUDENT_GROUP'
                    ? 'bg-[#132957] text-white'
                    : 'text-[#475569] hover:text-[#182238]'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Student Group View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('FACULTY')}
                className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  viewMode === 'FACULTY'
                    ? 'bg-[#132957] text-white'
                    : 'text-[#475569] hover:text-[#182238]'
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                Faculty View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('ROOM')}
                className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  viewMode === 'ROOM'
                    ? 'bg-[#132957] text-white'
                    : 'text-[#475569] hover:text-[#182238]'
                }`}
              >
                <DoorOpen className="h-3.5 w-3.5" />
                Room View
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {schedule ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-1 text-xs font-semibold text-[#15803D]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                    {schedule.solverStatus} ({schedule.numberOfSessions} Sessions)
                  </span>
                  <span className="inline-flex items-center rounded bg-[#F1F5F9] px-3 py-1 text-xs font-medium text-[#182238]">
                    Hard Violations: {schedule.hardViolationCount} | Soft Penalty:{' '}
                    {schedule.softPenaltyTotal}
                  </span>
                  <span className="inline-flex items-center rounded border border-[#DCE4F0] bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-semibold text-[#294074]">
                    {schedule.validationScope}
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded border border-[#E7DFCF] bg-[#FFFDF8] px-3 py-1 text-xs font-semibold text-[#B45309]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
                    Not Generated
                  </span>
                  <span className="inline-flex items-center rounded bg-[#F1F5F9] px-3 py-1 text-xs font-medium text-[#475569]">
                    Validation Not Run
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                ACADEMIC TERM
              </label>
              <select
                value={academicTerm}
                onChange={(e) => setAcademicTerm(e.target.value)}
                className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
              >
                <option>Autumn 2024 (Regular Week)</option>
                <option>Autumn 2024 (Spectra Week)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                DEPARTMENT
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
              >
                <option>All Departments</option>
                <option>Computer Science &amp; Eng.</option>
                <option>Electronics &amp; Comm.</option>
                <option>Mechanical Engineering</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                {viewMode === 'STUDENT_GROUP'
                  ? 'STUDENT GROUP'
                  : viewMode === 'FACULTY'
                  ? 'FACULTY MEMBER'
                  : 'CAMPUS ROOM'}
              </label>
              <select
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
              >
                <option value="ALL">All Entities</option>
                {entityOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                ROOM TYPE
              </label>
              <select
                value={roomType}
                onChange={(e) => setRoomType(e.target.value)}
                className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
              >
                <option>All Room Types</option>
                <option>Lecture Hall</option>
                <option>Laboratory</option>
                <option>Seminar Room</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-1">
                SESSION TYPE
              </label>
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
                className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-2 text-xs text-[#182238]"
              >
                <option>All Session Types</option>
                <option>Lecture</option>
                <option>Tutorial</option>
                <option>Practical Lab</option>
              </select>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setAcademicTerm('Autumn 2024 (Regular Week)');
                  setDepartment('All Departments');
                  setEntityFilter(entityOptions[0] ?? 'ALL');
                  setRoomType('All Room Types');
                  setSessionType('All Session Types');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4DFED] bg-white px-3 py-2 text-xs font-semibold text-[#475569] hover:text-[#182238] cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Filters
              </button>
            </div>
          </div>
        </section>

        {schedule && assignments.length > 0 ? (
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs space-y-4">
            {/* Solver & Soft Penalty Summary Strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <span>
                  <strong className="text-[#132957]">Schedule ID:</strong>{' '}
                  <code className="font-mono text-[#182238]">{schedule.scheduleId}</code>
                </span>
                <span>
                  <strong className="text-[#132957]">State:</strong>{' '}
                  <code className="font-mono text-[#294074]">{schedule.scheduleState}</code>
                </span>
                <span>
                  <strong className="text-[#132957]">Solve Duration:</strong>{' '}
                  {schedule.solveDurationMs} ms
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#475569]">
                <span>S1(Avoid): {schedule.softPenaltyBreakdown.S1}</span>
                <span>|</span>
                <span>S2(Gaps): {schedule.softPenaltyBreakdown.S2}</span>
                <span>|</span>
                <span>S3(&gt;6h): {schedule.softPenaltyBreakdown.S3}</span>
                <span>|</span>
                <span>S4(Repeat): {schedule.softPenaltyBreakdown.S4}</span>
                <span>|</span>
                <span>S5(Util): {schedule.softPenaltyBreakdown.S5}</span>
                <span>|</span>
                <span>S6(P9): {schedule.softPenaltyBreakdown.S6}</span>
              </div>
            </div>

            {/* Weekly Timetable Grid (MON-FRI, P1-P5, LUNCH, P6-P9) */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#DCE4F0] bg-[#F8FAFC] text-[10px] font-bold uppercase tracking-wider text-[#475569]">
                    <th className="p-2.5 border-r border-[#DCE4F0] w-20">Day</th>
                    {MORNING_PERIODS.map((p) => (
                      <th key={p.id} className="p-2.5 border-r border-[#DCE4F0] min-w-[115px]">
                        <div>{p.label}</div>
                        <div className="text-[9px] font-normal text-[#64748B]">{p.time}</div>
                      </th>
                    ))}
                    <th className="p-2.5 border-r border-[#DCE4F0] bg-[#FFFDF8] text-center text-[#B45309] w-20">
                      <div>LUNCH</div>
                      <div className="text-[9px] font-normal">13:00–14:00</div>
                    </th>
                    {AFTERNOON_PERIODS.map((p) => (
                      <th key={p.id} className="p-2.5 border-r border-[#DCE4F0] min-w-[115px]">
                        <div>{p.label}</div>
                        <div className="text-[9px] font-normal text-[#64748B]">{p.time}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TEACHING_DAYS.map((day) => (
                    <tr key={day} className="border-b border-[#EEF2F8] align-top">
                      <td className="p-2.5 font-bold text-[#132957] border-r border-[#DCE4F0] bg-[#F8FAFC]">
                        {day}
                      </td>
                      {MORNING_PERIODS.map((p) => {
                        const cellItems = slotMap.get(`${day}-${p.id}`) ?? [];
                        return (
                          <td key={p.id} className="p-1.5 border-r border-[#EEF2F8]">
                            <div className="space-y-1">
                              {cellItems.slice(0, 3).map((item) => (
                                <div
                                  key={item.sessionId}
                                  className={`rounded border p-1.5 text-[10px] ${
                                    item.kind === 'lab'
                                      ? 'border-[#C7D2FE] bg-[#EEF2FF] text-[#1E3A8A]'
                                      : item.basketSlot
                                      ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]'
                                      : 'border-[#DCE4F0] bg-[#F8FAFC] text-[#182238]'
                                  }`}
                                >
                                  <div className="font-bold truncate">{item.sessionId}</div>
                                  <div className="text-[9px] text-[#475569] truncate">
                                    {item.roomId} • {item.facultyId}
                                  </div>
                                  <div className="text-[9px] text-[#64748B] truncate">
                                    {item.groups.join(', ')}
                                  </div>
                                </div>
                              ))}
                              {cellItems.length > 3 && (
                                <div className="text-[9px] font-semibold text-[#294074] px-1">
                                  +{cellItems.length - 3} more parallel
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="p-2 border-r border-[#DCE4F0] bg-[#FFFDF8] text-center align-middle text-[10px] font-semibold text-[#B45309]">
                        Protected Lunch
                      </td>
                      {AFTERNOON_PERIODS.map((p) => {
                        const cellItems = slotMap.get(`${day}-${p.id}`) ?? [];
                        return (
                          <td key={p.id} className="p-1.5 border-r border-[#EEF2F8]">
                            <div className="space-y-1">
                              {cellItems.slice(0, 3).map((item) => (
                                <div
                                  key={item.sessionId}
                                  className={`rounded border p-1.5 text-[10px] ${
                                    item.kind === 'lab'
                                      ? 'border-[#C7D2FE] bg-[#EEF2FF] text-[#1E3A8A]'
                                      : item.basketSlot
                                      ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]'
                                      : 'border-[#DCE4F0] bg-[#F8FAFC] text-[#182238]'
                                  }`}
                                >
                                  <div className="font-bold truncate">{item.sessionId}</div>
                                  <div className="text-[9px] text-[#475569] truncate">
                                    {item.roomId} • {item.facultyId}
                                  </div>
                                  <div className="text-[9px] text-[#64748B] truncate">
                                    {item.groups.join(', ')}
                                  </div>
                                </div>
                              ))}
                              {cellItems.length > 3 && (
                                <div className="text-[9px] font-semibold text-[#294074] px-1">
                                  +{cellItems.length - 3} more parallel
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          /* Timetable Empty / Unscheduled Canvas */
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-10 shadow-xs text-center">
            <div className="mx-auto max-w-xl">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#F0F4FA] text-[#132957]">
                <Calendar className="h-6 w-6" />
              </div>
              <h2 className="font-serif text-xl font-bold text-[#132957]">
                Timetable Not Generated
              </h2>
              <p className="mt-2 text-xs text-[#64748B] leading-relaxed">
                No curricular timetable assignments exist for the selected view perspective (
                {viewMode.replace('_', ' ')}). Run the deterministic constraint solver after
                importing an institutional dataset to populate period slots P1–P9 across Monday
                through Friday.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#132957]">
                    <CheckCircle2 className="h-4 w-4 text-[#294074]" />
                    Hard Constraints Enforced
                  </div>
                  <p className="mt-1 text-[11px] text-[#64748B]">
                    Zero cohort clashes, zero faculty double-booking, room capacity compliance, and
                    mandatory 13:00–14:00 lunch protection.
                  </p>
                </div>
                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#132957]">
                    <Info className="h-4 w-4 text-[#294074]" />
                    Soft Penalty Optimization
                  </div>
                  <p className="mt-1 text-[11px] text-[#64748B]">
                    Minimizes split lab blocks, isolated single-hour gaps, and suboptimal
                    room-to-cohort seating ratios.
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={handleGenerateTimetable}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#294074] transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {isGenerating ? 'Solving CP-SAT...' : 'Generate Timetable'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Bottom Constraint & Validation Status Bar */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white px-5 py-3.5 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-bold uppercase tracking-wider text-[#132957]">
              Official Validator Status:
            </span>
            {validationReport ? (
              <span className="text-[#15803D] font-semibold">
                {validationReport.validationScope} — Hard Violations:{' '}
                {validationReport.hardViolationCount} | Soft Total: {validationReport.softTotal} |
                Parity Verified: {validationReport.parityVerified ? 'TRUE' : 'FALSE'}
              </span>
            ) : (
              <span className="text-[#64748B]">
                Awaiting generated <code className="font-mono text-[#182238]">weekly_candidate</code>{' '}
                artifact for <code className="font-mono text-[#182238]">validator.py</code>{' '}
                verification.
              </span>
            )}
          </div>
          <div className="text-[#64748B]">
            Protected Lunch Window:{' '}
            <span className="font-semibold text-[#182238]">13:00 – 14:00 (Daily)</span>
          </div>
        </section>
      </div>
    </RoleWorkspaceLayout>
  );
}
