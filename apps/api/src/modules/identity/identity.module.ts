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
import { ViewAsBootCheck } from './view-as.boot-check.js';
import { ViewAsGuard } from './view-as.guard.js';
import { ViewAsService } from './view-as.service.js';

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
    ViewAsService,
    ViewAsBootCheck,
    // Ordem: primeiro o rate limit (barato, protege o banco), depois a autenticação.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    // WB-352: depois da autenticação; cabeçalho `X-View-As` sem visão autorizada = 403 (falha fechada).
    { provide: APP_GUARD, useClass: ViewAsGuard },
  ],
  exports: [AuthService, CodeService, SessionService, PasswordService, PrincipalService, TicketService, ViewAsService],
})
export class IdentityModule {}
