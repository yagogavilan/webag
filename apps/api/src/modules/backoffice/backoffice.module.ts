import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { IdentityModule } from '../identity/index.js';
import { StoresModule } from '../stores/index.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { AlertsController } from './alerts.controller.js';
import { AlertsService } from './alerts.service.js';

/**
 * DEC-073 (B3 e B4): telas de operação do admin que cruzam módulos (alertas, usuários). Ninguém importa este módulo (sem ciclo): ele só lê as tabelas
 * dos outros pelo schema e age por serviços públicos (sessões, suspensão de loja, auditoria). Pedidos no admin (B5) ficam no módulo `orders`.
 */
@Module({
  imports: [AdminModule, IdentityModule, StoresModule],
  controllers: [AlertsController, AccountsController],
  providers: [AlertsService, AccountsService],
})
export class BackofficeModule {}
