export enum SubsystemStatus {
  READY = 'ready',
  CONNECTED = 'connected',
  CONFIGURED = 'configured',
  NOT_CONFIGURED = 'not_configured',
  UNAVAILABLE = 'unavailable',
  DEGRADED = 'degraded',
  ERROR = 'error',
}

export interface HealthResponse {
  status: 'ok';
  service: 'cit-schedora-api';
  version: 'v1';
}

export interface ReadinessResponse {
  backend: SubsystemStatus;
  firebaseProject: SubsystemStatus;
  firestore: SubsystemStatus;
  authentication: SubsystemStatus;
  llm: SubsystemStatus;
  scheduler: SubsystemStatus;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  requestId: string;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}
