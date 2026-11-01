import { collection, deleteDoc, getDocs } from 'firebase/firestore';
import { getRuntimeServerFirestore } from './firebase.service.ts';
import { recordAuditEvent } from './audit.service.ts';
import { ForbiddenError } from '../utils/errors.ts';
import { logger } from '../utils/logger.ts';

export interface DemoResetInput {
  actorUid: string;
  actorEmail: string;
  actorRole: string;
}

export async function resetDemoOperationalState(input: DemoResetInput) {
  if (input.actorRole !== 'admin') {
    throw new ForbiddenError('Only administrators can perform a demo operational reset.');
  }

  const db = getRuntimeServerFirestore();

  // Safely clear dynamic operational collections only
  const dynamicCollections = ['reschedulingProposals', 'bookingDecisionRuns', 'examinationSchedules'];
  let deletedCount = 0;

  for (const colName of dynamicCollections) {
    try {
      const colRef = collection(db, colName);
      const snapshot = await getDocs(colRef);
      for (const docSnap of snapshot.docs) {
        await deleteDoc(docSnap.ref);
        deletedCount++;
      }
    } catch (err) {
      logger.warn(`Failed to clear collection ${colName} during demo reset`, { error: err });
    }
  }

  await recordAuditEvent({
    actorUid: input.actorUid,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    module: 'system',
    action: 'demo_reset',
    outcome: 'success',
    metadata: {
      deletedDynamicDocsCount: deletedCount,
      preservedDataset: 'cit-public-v1',
      preservedAuth: true,
      preservedSystemMeta: true,
    },
  });

  logger.info('Demo operational reset performed successfully', {
    actorUid: input.actorUid,
    deletedDocsCount: deletedCount,
  });

  return {
    success: true,
    message: 'Demo operational state reset successfully. Active dataset and demo accounts remain intact.',
    deletedDocsCount: deletedCount,
  };
}
