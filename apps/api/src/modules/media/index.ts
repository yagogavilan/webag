// API pública do módulo media (ADR-007 §2).
export { MediaModule } from './media.module.js';
export { MediaService, UploadRejectedError, type MediaAsset } from './media.service.js';
export { presentMedia } from './media.controller.js';
export { MEDIA_PURPOSES, type MediaPurpose } from './db/schema.js';
