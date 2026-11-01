import React, { useEffect, useState } from 'react';
import {
  History,
  Search,
  ShieldCheck,
  FileCode2,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

export function AdminAuditLogsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('All System Modules');
  const [outcomeFilter, setOutcomeFilter] = useState('All Outcomes');
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  useEffect(() => {
    fetch('/api/v1/audit-logs?limit=100', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (Array.isArray(json?.logs)) {
          setLogs(json.logs);
          if (json.logs.length > 0) setSelectedLog(json.logs[0]);
        }
      })
      .catch(() => {});
  }, []);

  const filteredLogs = logs.filter((log) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      String(log.action || '').toLowerCase().includes(q) ||
      String(log.actorEmail || '').toLowerCase().includes(q) ||
      String(log.targetCollection || '').toLowerCase().includes(q) ||
      String(log.targetId || '').toLowerCase().includes(q);
    const matchesOutcome =
      outcomeFilter === 'All Outcomes' ||
      (outcomeFilter === 'Committed' && log.outcome === 'ALLOWED') ||
      (outcomeFilter === 'Rejected by Validator' && log.outcome === 'DENIED');
    return matchesSearch && matchesOutcome;
  });

  return (
    <RoleWorkspaceLayout
      title="Audit Logs"
      subtitle="Immutable governance trail of dataset activations, solver runs, booking approvals, and schedule mutations."
      breadcrumbCurrent="Audit Logs"
    >
      <div className="space-y-6" data-testid="admin-audit-logs-screen">
        {/* Filter Bar */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search actor, request ID, or entity..."
                className="w-full rounded-lg border border-[#D4DFED] bg-[#F8FAFC] pl-8 pr-3 py-1.5 text-xs text-[#182238]"
              />
            </div>

            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#182238]"
            >
              <option>All System Modules</option>
              <option>Dataset Ingestion</option>
              <option>Timetable Solver</option>
              <option>Venue Bookings</option>
              <option>Dynamic Rescheduling</option>
              <option>Authentication &amp; RBAC</option>
            </select>

            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="rounded-lg border border-[#D4DFED] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#182238]"
            >
              <option>All Outcomes</option>
              <option>Committed</option>
              <option>Rejected by Validator</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#64748B]">
            <ShieldCheck className="h-4 w-4 text-[#132957]" />
            <span>Append-Only Institutional Ledger</span>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Audit Activity Stream */}
          <section className="lg:col-span-2 rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#EEF2F8] pb-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-[#132957]" />
                <h2 className="font-serif text-base font-bold text-[#132957]">
                  Audit Activity Stream
                </h2>
              </div>
              <span className="text-xs text-[#64748B]">{filteredLogs.length} Recorded Events</span>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center text-xs text-[#64748B]">
                No audit events recorded yet. Events are appended automatically when datasets are imported, schedules are generated, or booking decisions are committed.
              </div>
            ) : (
              <div className="max-h-[480px] overflow-y-auto divide-y divide-[#EEF2F8]">
                {filteredLogs.map((log, i) => (
                  <button
                    key={log.auditId || i}
                    type="button"
                    onClick={() => setSelectedLog(log)}
                    className={`w-full text-left p-3 hover:bg-[#F8FAFC] transition-colors flex items-start justify-between gap-3 cursor-pointer ${
                      selectedLog?.auditId === log.auditId ? 'bg-[#F0F4FA]' : ''
                    }`}
                  >
                    <div>
                      <div className="font-mono text-xs font-bold text-[#132957]">
                        {log.action}
                      </div>
                      <div className="text-[11px] text-[#475569] mt-0.5">
                        Actor: <span className="font-semibold">{log.actorEmail || log.actorUid}</span> ({log.actorRole}) · Target: <span className="font-mono">{log.targetCollection}/{log.targetId}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          log.outcome === 'ALLOWED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {log.outcome || 'COMMITTED'}
                      </span>
                      <div className="text-[10px] font-mono text-[#64748B] mt-1">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Right Column: Audit Record Details & State Diff Inspector */}
          <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EEF2F8] pb-3">
              <FileCode2 className="h-4 w-4 text-[#132957]" />
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Audit Record Inspector
              </h2>
            </div>

            {!selectedLog ? (
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-5 text-center text-xs text-[#64748B]">
                Select an audit entry from the activity stream to inspect the recorded before/after JSON state diff and approval trace.
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-[#64748B]">Audit ID</div>
                  <div className="font-mono text-[#132957] break-all">{selectedLog.auditId}</div>
                </div>
                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-[#64748B]">Action &amp; Target</div>
                  <div className="font-semibold text-[#182238]">{selectedLog.action}</div>
                  <div className="font-mono text-[11px] text-[#64748B]">
                    {selectedLog.targetCollection} / {selectedLog.targetId}
                  </div>
                </div>
                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-[#64748B]">Recorded Metadata / State Diff</div>
                  <pre className="font-mono text-[10px] text-[#182238] overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </RoleWorkspaceLayout>
  );
}

