// API pública do módulo identity (ADR-007 §2).
export { IdentityModule } from './identity.module.js';
export { SessionService, type SessionRevokedEvent, type TokenPair } from './session.service.js';
export { BreakGlassService, BreakGlassError } from './break-glass.service.js';
