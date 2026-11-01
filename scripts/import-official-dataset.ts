import {
  DEFAULT_OFFICIAL_DATASET_PATH,
  ensureDatabaseSchemaMigration,
  importOfficialDataset,
} from '../services/dataset.service.ts';
import { verifyAndInitializeFirestore } from '../services/firebase.service.ts';

async function main() {
  const projectConfigResult = await verifyAndInitializeFirestore();
  if (!projectConfigResult.writeSucceeded || !projectConfigResult.readSucceeded) {
    throw new Error('Failed to verify systemMeta/projectConfig before dataset import.');
  }

  const schemaMeta = await ensureDatabaseSchemaMigration();
  const result = await importOfficialDataset({
    sourceFilename: 'data/cit_public.json',
    importedBy: 'server-provisioning-cli',
  });

  console.log(
    JSON.stringify(
      {
        firebaseProjectId: projectConfigResult.projectId,
        firestoreDatabaseId: projectConfigResult.firestoreDatabaseId,
        projectConfigPreserved: true,
        projectConfigCreatedAt: projectConfigResult.documentData?.createdAt,
        databaseSchema: schemaMeta,
        datasetPath: DEFAULT_OFFICIAL_DATASET_PATH,
        datasetId: result.datasetId,
        versionId: result.versionId,
        checksum: result.checksum,
        alreadyImported: result.alreadyImported,
        verifiedFirestoreCounts: result.verifiedFirestoreCounts,
        referentialIntegrity: result.validation.referentialIntegrity,
        importJob: result.importJob,
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Official dataset import failed:', err);
  process.exit(1);
});
