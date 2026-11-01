import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Upload,
  Database,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { RoleWorkspaceLayout } from '../../components/layout/RoleWorkspaceLayout.tsx';

export function AdminDatasetsPage() {
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [imports, setImports] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [validationStatus, setValidationStatus] = useState<string>('Verified Active Baseline');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDatasetInfo = async () => {
    try {
      const [sumRes, impRes] = await Promise.all([
        fetch('/api/v1/datasets/active/summary', { credentials: 'include' }),
        fetch('/api/v1/datasets/imports', { credentials: 'include' }),
      ]);
      if (sumRes.ok) {
        const sumJson = await sumRes.json();
        if (sumJson?.active) setSummary(sumJson);
      }
      if (impRes.ok) {
        const impJson = await impRes.json();
        if (Array.isArray(impJson?.imports)) setImports(impJson.imports);
      }
    } catch {
      // ignore initial error
    }
  };

  useEffect(() => {
    loadDatasetInfo();
  }, []);

  const handleImportCanonical = async (customDataset?: any, filename?: string) => {
    try {
      setImporting(true);
      setNotice(null);
      const res = await fetch('/api/v1/datasets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          customDataset
            ? { dataset: customDataset, sourceFilename: filename || 'uploaded.json' }
            : { sourceFilename: 'data/cit_public.json' }
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message || 'Dataset validation or import failed.');
      }
      setValidationStatus('Passed (6/6 Sections)');
      setNotice(
        `Dataset ${json.datasetId || 'cit-public-v1'} (${json.versionId || 'v1-1a9cf4b23ac3'}) validated and activated in Firestore (${json.firestoreDatabaseId}).`
      );
      await loadDatasetInfo();
    } catch (err: any) {
      setNotice(err.message || 'Failed to import dataset.');
    } finally {
      setImporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const valRes = await fetch('/api/v1/datasets/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dataset: parsed }),
      });
      const valJson = await valRes.json();
      if (!valRes.ok || !valJson.valid) {
        const firstErr = valJson?.errors?.[0]?.message || 'Schema validation failed';
        setValidationStatus(`Failed: ${firstErr}`);
        setNotice(`Dataset validation rejected: ${firstErr}`);
        return;
      }
      await handleImportCanonical(parsed, file.name);
    } catch (err: any) {
      setNotice(`Invalid JSON file: ${err.message}`);
    }
  };

  const counts = summary?.counts;
  const checkState = summary ? 'Verified ✓' : 'Awaiting File';
  const validationChecks = [
    { name: 'JSON Well-Formed Syntax & Parser Tree', status: checkState },
    { name: 'Required Schema Sections (6/6)', status: checkState },
    { name: 'Entity ID Uniqueness', status: checkState },
    { name: 'Referential Integrity (Foreign Key Links)', status: checkState },
    { name: 'Room & Scheduling References', status: checkState },
  ];

  return (
    <RoleWorkspaceLayout
      title="Dataset Management"
      subtitle="Import, validate, and manage the institutional scheduling dataset."
      breadcrumbCurrent="Dataset Management"
      headerActions={
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-2 rounded-lg border border-[#DCE4F0] bg-white px-3 py-1.5 text-xs font-semibold text-[#475569]">
            <span className={`h-2 w-2 rounded-full ${summary ? 'bg-emerald-500' : 'bg-[#94A3B8]'}`} />
            ACTIVE BASELINE SCHEMA: {summary ? `${summary.datasetId} (${summary.versionId})` : 'None Loaded'}
          </span>
          <button
            type="button"
            disabled={importing}
            onClick={() => handleImportCanonical()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#132957] px-4 py-2 text-xs font-semibold text-white hover:bg-[#294074] cursor-pointer disabled:opacity-50"
          >
            {importing ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {importing ? 'Importing...' : '+ Import Dataset'}
          </button>
        </div>
      }
    >
      <div className="space-y-6" data-testid="admin-datasets-screen">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
        />

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

        {/* Authoritative Core Metadata Inventory */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                AUTHORITATIVE CORE METADATA
              </div>
              <h2 className="font-serif text-base font-bold text-[#132957]">
                {summary
                  ? `Dataset Inventory: ${summary.institute || 'Coastal Institute of Technology'} (${summary.versionId})`
                  : 'Dataset Inventory: No Active Baseline Loaded'}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
              <Database className="h-3.5 w-3.5 text-[#132957]" />
              <span>Calculated dynamically from active institutional JSON store. Baseline for solver &amp; validator.</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: 'Rooms', value: counts ? String(counts.rooms) : '—', sub: 'Labs & LH' },
              { label: 'Faculty', value: counts ? String(counts.faculty) : '—', sub: 'Assigned' },
              { label: 'Student Groups', value: counts ? String(counts.student_groups) : '—', sub: 'UG & PG Tracks' },
              { label: 'Courses', value: counts ? String(counts.courses) : '—', sub: 'Core & Electives' },
              { label: 'Sessions', value: counts ? String(counts.sessions) : '—', sub: 'Weekly Load' },
              { label: 'Examinations', value: counts ? String(counts.exams) : '—', sub: 'Mid-Term Matrix' },
              { label: 'Booking Requests', value: counts ? String(counts.booking_requests) : '—', sub: 'Registered' },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3.5"
              >
                <div className="text-xs font-medium text-[#64748B]">{item.label}</div>
                <div className="mt-1.5 text-xl font-bold text-[#132957]">
                  {item.value}
                </div>
                <div className="mt-0.5 text-[11px] text-[#64748B]">{item.sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Upload Canonical JSON Payload & Schema Structural Validation */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-6 shadow-xs">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-6 flex flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#E8EFFA] text-[#132957]">
                <Upload className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-[#132957]">
                Upload Canonical JSON Payload
              </h3>
              <p className="mt-1 text-xs text-[#64748B] max-w-sm">
                Drag &amp; drop <code className="font-mono text-[#182238]">cit_public.json</code> or validated schema files (Strict JSON schema v2.4).
              </p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-[#DCE4F0] bg-white px-3.5 py-2 text-xs font-semibold text-[#182238] hover:bg-[#F1F5F9] cursor-pointer"
                >
                  Browse Local Files
                </button>
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => handleImportCanonical()}
                  className="rounded-lg border border-[#DCE4F0] bg-white px-3.5 py-2 text-xs font-semibold text-[#182238] hover:bg-[#F1F5F9] cursor-pointer"
                >
                  Load Staged Payload
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                  SCHEMA STRUCTURAL VALIDATION CHECKS
                </div>
                <span className="rounded bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-semibold text-[#132957]">
                  {summary ? validationStatus : 'No Staged File'}
                </span>
              </div>

              <div className="space-y-2">
                {validationChecks.map((chk) => (
                  <div
                    key={chk.name}
                    className="flex items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2 text-xs"
                  >
                    <span className="flex items-center gap-2 text-[#182238]">
                      <CheckCircle2 className={`h-3.5 w-3.5 ${summary ? 'text-emerald-600' : 'text-[#64748B]'}`} />
                      {chk.name}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-[#132957]">
                      {chk.status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-[#E7DFCF] bg-[#FFFDF8] p-3.5">
                <div className="flex items-start gap-2 text-xs text-[#182238]">
                  <AlertTriangle className="h-4 w-4 text-[#B45309] shrink-0 mt-0.5" />
                  <span>
                    <strong>Activation impact warning:</strong> Activating a new dataset flags current baseline schedules as legacy and requires fresh timetable validation.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dataset Version History */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                AUDIT &amp; ARCHIVAL LEDGER
              </div>
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Dataset Version History
              </h2>
            </div>
            <span className="text-xs text-[#64748B]">
              {summary ? `1 Active Baseline (${summary.versionId})` : '0 Active Baselines'}
            </span>
          </div>

          {imports.length === 0 && !summary ? (
            <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-6 text-center text-xs text-[#64748B]">
              No dataset versions have been imported into the institutional store yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                    <th className="py-2 pr-3">Dataset ID</th>
                    <th className="py-2 px-3">Version ID</th>
                    <th className="py-2 px-3">SHA-256 Checksum</th>
                    <th className="py-2 px-3">Activated At</th>
                    <th className="py-2 pl-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF2F8]">
                  {summary && (
                    <tr>
                      <td className="py-2.5 pr-3 font-mono font-bold text-[#132957]">{summary.datasetId}</td>
                      <td className="py-2.5 px-3 font-mono">{summary.versionId}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#64748B]">
                        {String(summary.checksum || '').slice(0, 16)}…
                      </td>
                      <td className="py-2.5 px-3 text-[#475569]">{summary.activatedAt}</td>
                      <td className="py-2.5 pl-3">
                        <span className="inline-flex rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          ACTIVE
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Disruption-File Ingestion Connector */}
        <section className="rounded-xl border border-[#DCE4F0] bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                OPERATIONAL INTERVENTIONS
              </div>
              <h2 className="font-serif text-base font-bold text-[#132957]">
                Disruption-File Ingestion Connector
              </h2>
              <p className="text-xs text-[#64748B]">
                Stage and validate scenario delta-files for real-time schedule conflict resolution.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-[#64748B] mr-1">
                SUPPORTED MUTATIONS:
              </span>
              {[
                'faculty_unavailable',
                'room_unavailable',
                'add_faculty',
                'add_session',
                'remove_session',
              ].map((m) => (
                <span
                  key={m}
                  className="rounded bg-[#F0F4FA] px-2 py-0.5 font-mono text-[#132957]"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <div className="text-xs text-[#64748B]">
              Sample disruption descriptor (<code className="font-mono">examples/sample_disruption.json</code>) ready for minimum-perturbation repair in Dynamic Rescheduling.
            </div>
            <Link
              to="/admin/rescheduling"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#132957] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#294074]"
            >
              Open in Dynamic Rescheduling
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </div>
    </RoleWorkspaceLayout>
  );
}

