var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { RateLimitGuard } from '../../platform/ratelimit/rate-limit.guard.js';
import { AdminModule } from '../admin/index.js';
import { UsersModule } from '../users/index.js';
import { AccountController } from './account.controller.js';
import { AdminUsersController, AdminTotpController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { BreakGlassService } from './break-glass.service.js';
import { AuthService } from './auth.service.js';
import { CodeService } from './code.service.js';
import { PasswordService } from './password.service.js';
import { PrincipalService } from './principal.service.js';
import { SessionService } from './session.service.js';
import { TicketService } from './ticket.service.js';
import { TotpService } from './totp.service.js';
let IdentityModule = class IdentityModule {
};
IdentityModule = __decorate([
    Module({
        imports: [JwtModule.register({}), AdminModule, UsersModule],
        controllers: [AuthController, AccountController, AdminUsersController, AdminTotpController],
        providers: [
            AuthService,
            AdminUsersService,
            BreakGlassService,
            CodeService,
            PasswordService,
            PrincipalService,
            SessionService,
            TicketService,
            TotpService,
            // Ordem: primeiro o rate limit (barato, protege o banco), depois a autenticação.
            { provide: APP_GUARD, useClass: RateLimitGuard },
            { provide: APP_GUARD, useClass: AuthGuard },
        ],
        exports: [AuthService, CodeService, SessionService, PasswordService, PrincipalService, TicketService],
    })
], IdentityModule);
export { IdentityModule };
//# sourceMappingURL=identity.module.js.map