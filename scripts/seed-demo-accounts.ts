import { seedDemoAccounts } from '../services/auth.service.ts';

async function main() {
  const demoSeedEnabled = process.env.DEMO_SEED_ENABLED === 'true';
  if (!demoSeedEnabled) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: {
            code: 'DEMO_SEED_DISABLED',
            message:
              'Demo account seeding requires DEMO_SEED_ENABLED=true. Run: DEMO_SEED_ENABLED=true npm run auth:seed',
          },
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  try {
    const report = await seedDemoAccounts();
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: {
            code: 'DEMO_SEED_FAILED',
            message: err instanceof Error ? err.message : String(err),
          },
        },
        null,
        2
      )
    );
    process.exit(1);
  }
}

void main();
