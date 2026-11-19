var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Controller, Get } from '@nestjs/common';
import { Public } from '../platform/auth/decorators.js';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator, RedisHealthIndicator } from './health.indicators.js';
/** Endpoints operacionais, fora do prefixo /v1 (contrato: getHealth, getReadiness). */
let HealthController = class HealthController {
    health;
    database;
    redis;
    constructor(health, database, redis) {
        this.health = health;
        this.database = database;
        this.redis = redis;
    }
    /** Liveness: não consulta dependências. */
    liveness() {
        return this.health.check([]);
    }
    /** Readiness: PostgreSQL e Redis precisam responder; senão 503. */
    readiness() {
        return this.health.check([() => this.database.check(), () => this.redis.check()]);
    }
};
__decorate([
    Get(),
    HealthCheck(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "liveness", null);
__decorate([
    Get('ready'),
    HealthCheck(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "readiness", null);
HealthController = __decorate([
    Public(),
    Controller('health'),
    __metadata("design:paramtypes", [HealthCheckService,
        DatabaseHealthIndicator,
        RedisHealthIndicator])
], HealthController);
export { HealthController };
//# sourceMappingURL=health.controller.js.map