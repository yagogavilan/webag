// API pública do módulo admin (ADR-007 §2): outros módulos só importam daqui.
export { AdminModule } from './admin.module.js';
export { AuditService } from './audit.service.js';
export { ParametersService } from './parameters.service.js';
export { FeatureFlagsService } from './feature-flags.service.js';
export { LegalService } from './legal.service.js';
export { LEGAL_DOCUMENT_TYPES } from './db/schema.js';
export { RegionsService } from './regions.service.js';
//# sourceMappingURL=index.js.map