import { Router } from 'express';
import { authRouter } from './auth.routes.ts';
import { datasetsRouter } from './datasets.routes.ts';
import { healthRouter } from './health.routes.ts';
import { auditLogsRouter, rbacRouter, usersRouter } from './rbac.routes.ts';
import { schedulesRouter } from './schedules.routes.ts';
import { examinationsRouter } from './examinations.routes.ts';
import { bookingsRouter } from './bookings.routes.ts';
import { aiRouter } from './ai.routes.ts';
import { reschedulingRouter } from './rescheduling.routes.ts';
import { manualSchedulingRouter } from './manual.routes.ts';
import { reportsRouter } from './reports.routes.ts';
import { adminRouter } from './admin.routes.ts';

export const apiV1Router = Router();

apiV1Router.use('/', healthRouter);
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/datasets', datasetsRouter);
apiV1Router.use('/users', usersRouter);
apiV1Router.use('/audit-logs', auditLogsRouter);
apiV1Router.use('/rbac', rbacRouter);
apiV1Router.use('/schedules', schedulesRouter);
apiV1Router.use('/examinations', examinationsRouter);
apiV1Router.use('/bookings', bookingsRouter);
apiV1Router.use('/ai', aiRouter);
apiV1Router.use('/rescheduling', reschedulingRouter);
apiV1Router.use('/manual-scheduling', manualSchedulingRouter);
apiV1Router.use('/reports', reportsRouter);
apiV1Router.use('/admin', adminRouter);


