import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, RefreshCw } from 'lucide-react';
import type { HealthResponse, ReadinessResponse } from '../../../types/api.types.ts';

/**
 * Developer-only diagnostic status route (/dev/system-status).
 * Isolated from all normal institutional user navigation and dashboards.
 */
export function SystemStatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const [hRes, rRes] = await Promise.all([
        fetch('/api/v1/health'),
        fetch('/api/v1/readiness'),
      ]);
      const hJson = (await hRes.json()) as HealthResponse;
      const rJson = (await rRes.json()) as ReadinessResponse;
      setHealth(hJson);
      setReadiness(rJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to query system status');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  return (
    <div
      data-testid="dev-system-status-page"
      className="min-h-screen bg-[#FFFDF8] text-[#182238] p-8 max-w-4xl mx-auto space-y-6"
    >
      <div className="flex items-center justify-between border-b border-[#E7DFCF] pb-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#294074]">
            Developer Diagnostic Route (/dev/system-status)
          </div>
          <h1 className="text-2xl font-institutional-serif font-bold mt-1">
            System Health &amp; Subsystem Readiness
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void loadStatus()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#294074] text-white text-xs font-medium"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-md border border-[#D62D32] bg-[#D62D32]/5 text-xs text-[#D62D32]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-[#E7DFCF] p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>GET /api/v1/health</span>
          </div>
          <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs font-mono overflow-x-auto">
            {health ? JSON.stringify(health, null, 2) : 'Loading...'}
          </pre>
        </div>

        <div className="bg-white rounded-lg border border-[#E7DFCF] p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="w-4 h-4 text-[#294074]" />
            <span>GET /api/v1/readiness</span>
          </div>
          <pre className="bg-slate-900 text-slate-100 rounded-md p-3 text-xs font-mono overflow-x-auto">
            {readiness ? JSON.stringify(readiness, null, 2) : 'Loading...'}
          </pre>
        </div>
      </div>
    </div>
  );
}
