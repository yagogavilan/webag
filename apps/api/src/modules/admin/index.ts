// API pública do módulo admin (ADR-007 §2): outros módulos só importam daqui.
export { AdminModule } from './admin.module.js';
export { AuditService, sanitizeForAudit, type AuditEntry, type AuditRow } from './audit.service.js';
export { asHistoryObject, actorKindOf, decodeReason, encodeReason, historyTypeOf, STORE_HISTORY_TYPES, summaryOf, targetTypeOf, type StoreHistoryType } from './store-history.js';
export { ParametersService } from './parameters.service.js';
export { FeatureFlagsService } from './feature-flags.service.js';
export { LegalService, type LegalDocument } from './legal.service.js';
export { LEGAL_DOCUMENT_TYPES, type LegalDocumentType } from './db/schema.js';
export { RegionsService } from './regions.service.js';
export { MaintenanceService, type MaintenanceView } from './maintenance.service.js';
export { ALERT_AREAS, ALERT_KINDS, ALERT_SEVERITIES, alertKindInfo, alertKindsVisibleTo, canSeeAlertKind, type AlertArea, type AlertSeverity } from './alert-catalog.js';
export { INITIAL_CATEGORY_TEMPLATES, initialTemplateFor } from './category-templates.js';
