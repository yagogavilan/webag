// API pública do módulo notifications (ADR-004, ADR-007 §2).
export { NotificationsModule } from './notifications.module.js';
export { PushTransport, type PushMessage } from './push.transport.js';
export { pushDevices } from './db/schema.js';
