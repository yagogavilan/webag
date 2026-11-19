var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { IdentityModule } from '../identity/index.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { DataExportService } from './data-export.service.js';
import { AdminPrivacyRequestsController, PrivacyRequestPublicController } from './dsr.controller.js';
import { DsrService } from './dsr.service.js';
import { RetentionService } from './retention.service.js';
import { WebAccountDeletionService } from './web-deletion.service.js';
import { AccountDeletionController, AccountDeletionPublicController, DataExportController, DataExportDownloadController } from './privacy.controller.js';
/**
 * LGPD (O6.1): exclusão de conta, exportação de dados, pedidos de titulares e retenção. Exceção consciente à regra "um módulo não
 * lê a tabela do outro" (ADR-012): anonimizar e exportar precisam varrer todas as tabelas com dado pessoal, e centralizar isso aqui
 * é melhor do que espalhar a regra de LGPD por cada módulo. Nenhum outro módulo importa daqui.
 */
let PrivacyModule = class PrivacyModule {
};
PrivacyModule = __decorate([
    Module({
        imports: [AdminModule, IdentityModule],
        controllers: [AccountDeletionController, AccountDeletionPublicController, DataExportController, DataExportDownloadController, PrivacyRequestPublicController, AdminPrivacyRequestsController],
        providers: [AccountDeletionService, DataExportService, DsrService, RetentionService, WebAccountDeletionService],
        exports: [AccountDeletionService, DataExportService],
    })
], PrivacyModule);
export { PrivacyModule };
//# sourceMappingURL=privacy.module.js.map