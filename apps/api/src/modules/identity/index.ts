// API pública do módulo identity (ADR-007 §2).
export { IdentityModule } from './identity.module.js';
export { PasswordService } from './password.service.js';
export { SessionService, type SessionRevokedEvent, type TokenPair } from './session.service.js';
export { BreakGlassService, BreakGlassError } from './break-glass.service.js';
export { PrincipalService } from './principal.service.js';
export { AuthService } from './auth.service.js';
export { CodeService } from './code.service.js';
export { TicketService } from './ticket.service.js';
export { emailSchema, passwordSchema, codeSchema } from './auth.schemas.js';
