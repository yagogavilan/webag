var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/index.js';
import { ContentReportsService } from './content-reports.service.js';
import { AdminContentReportsController, AdminHelpController, ContentReportsController, HelpController, StoreReviewsController } from './feedback.controllers.js';
import { HelpService } from './help.service.js';
import { StoreReviewsService } from './store-reviews.service.js';
/** O6.5: ajuda (FAQ e contatos), denúncia e moderação de conteúdo, resposta do lojista às avaliações. */
let FeedbackModule = class FeedbackModule {
};
FeedbackModule = __decorate([
    Module({
        imports: [AdminModule],
        controllers: [HelpController, AdminHelpController, ContentReportsController, AdminContentReportsController, StoreReviewsController],
        providers: [HelpService, ContentReportsService, StoreReviewsService],
        exports: [HelpService],
    })
], FeedbackModule);
export { FeedbackModule };
//# sourceMappingURL=feedback.module.js.map