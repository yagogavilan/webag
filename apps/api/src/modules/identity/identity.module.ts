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

@Module({
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
export class IdentityModule {}
