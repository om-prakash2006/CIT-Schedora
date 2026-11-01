import { randomBytes } from 'node:crypto';
import {
  collection,
  doc,
  getDocsFromServer,
  query,
  setDoc,
  where,
  type Firestore as ClientFirestore,
} from 'firebase/firestore';
import {
  AuditLogDocSchema,
  type AuditLogDoc,
} from '../types/firestore-schema.ts';
import { redactSensitiveData } from '../utils/logger.ts';
import { getRuntimeServerFirestore } from './firebase.service.ts';

export const AUDIT_LOGS_COLLECTION = 'auditLogs';

export interface RecordAuditEventInput {
  readonly actorUid: string;
  readonly actorEmail?: string | null;
  readonly actorRole?: string | null;
  readonly targetUid?: string | null;
  readonly module:
    | 'auth'
    | 'rbac'
    | 'users'
    | 'datasets'
    | 'bookings'
    | 'scheduling'
    | 'system';
  readonly action: string;
  readonly outcome: 'success' | 'failure' | 'denied';
  readonly metadata?: Record<string, unknown>;
}

function sanitizeAuditMetadata(
  rawMetadata: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!rawMetadata) {
    return {};
  }
  const redacted = redactSensitiveData(rawMetadata);
  if (typeof redacted === 'object' && redacted !== null && !Array.isArray(redacted)) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(redacted as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (
        lower.includes('password') ||
        lower.includes('token') ||
        lower.includes('cookie') ||
        lower.includes('secret') ||
        lower.includes('apikey')
      ) {
        continue;
      }
      if (
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean' ||
        v === null
      ) {
        clean[k] = v;
      } else if (Array.isArray(v)) {
        clean[k] = v.map((item) => String(item)).slice(0, 20);
      } else if (typeof v === 'object') {
        clean[k] = JSON.stringify(v).slice(0, 300);
      }
    }
    return clean;
  }
  return {};
}

/**
 * Writes an immutable, append-only institutional audit event to Firestore `auditLogs/{auditId}`
 * in the named database `ai-studio-citschedora-f4f986f9-b368-44a8-97a0-e8053dab69b9`.
 * Never logs or persists passwords, tokens, session cookies, or private keys.
 */
export async function recordAuditEvent(
  input: RecordAuditEventInput,
  db: ClientFirestore = getRuntimeServerFirestore()
): Promise<AuditLogDoc> {
  const nowIso = new Date().toISOString();
  const randomSuffix = randomBytes(4).toString('hex');
  const auditId = `audit_${Date.now()}_${randomSuffix}`;

  const docCandidate: AuditLogDoc = AuditLogDocSchema.parse({
    auditId,
    actorUid: input.actorUid || 'anonymous',
    actorEmail: input.actorEmail ?? null,
    actorRole: input.actorRole ?? null,
    targetUid: input.targetUid ?? null,
    module: input.module,
    action: input.action,
    outcome: input.outcome,
    metadata: sanitizeAuditMetadata(input.metadata),
    createdAt: nowIso,
  });

  await setDoc(doc(db, AUDIT_LOGS_COLLECTION, auditId), docCandidate);
  return docCandidate;
}

/**
 * Lists recorded institutional audit log entries from Firestore `auditLogs`.
 */
export async function listAuditLogs(
  limitCount = 100,
  db: ClientFirestore = getRuntimeServerFirestore()
): Promise<AuditLogDoc[]> {
  const snap = await getDocsFromServer(
    query(
      collection(db, AUDIT_LOGS_COLLECTION),
      where('outcome', 'in', ['success', 'failure', 'denied'])
    )
  );
  const items = snap.docs.map((d) => d.data() as AuditLogDoc);
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return items.slice(0, limitCount);
}
