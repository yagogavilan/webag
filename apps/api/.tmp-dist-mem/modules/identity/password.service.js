var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { errors } from '../../platform/http/app-error.js';
import { COMMON_PASSWORDS } from './common-passwords.js';
/** SEC-001 / ADR-003: Argon2id m = 19 MiB, t = 2, p = 1. */
export const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
};
export const PASSWORD_MAX_LENGTH = 128;
let PasswordService = class PasswordService {
    dummyHash = '';
    async onModuleInit() {
        // Hash de mentira para igualar o tempo de login com e-mail inexistente (SEC-004).
        this.dummyHash = await argon2.hash('webag-dummy-password-for-timing', ARGON2_OPTIONS);
    }
    hash(password) {
        return argon2.hash(password, ARGON2_OPTIONS);
    }
    async verify(hash, password) {
        if (!hash) {
            await this.verifyDummy(password);
            return false;
        }
        try {
            return await argon2.verify(hash, password);
        }
        catch {
            return false;
        }
    }
    async verifyDummy(password) {
        if (!this.dummyHash)
            this.dummyHash = await argon2.hash('webag-dummy-password-for-timing', ARGON2_OPTIONS);
        await argon2.verify(this.dummyHash, password).catch(() => false);
    }
    /** SEC-001: 422 para senha curta, longa demais ou comum/vazada. Nunca trunca. */
    assertPolicy(password, minLength) {
        const fail = (message) => {
            throw errors.unprocessable('WEAK_PASSWORD', 'Senha fraca', { detail: message, errors: [{ field: 'password', message }] });
        };
        if ([...password].length < minLength)
            fail(`Use pelo menos ${minLength} caracteres.`);
        if ([...password].length > PASSWORD_MAX_LENGTH)
            fail(`Use no máximo ${PASSWORD_MAX_LENGTH} caracteres.`);
        if (COMMON_PASSWORDS.has(password.toLowerCase()))
            fail('Essa senha é muito comum. Escolha outra.');
        if (/^(.)\1+$/.test(password))
            fail('Evite repetir o mesmo caractere.');
    }
};
PasswordService = __decorate([
    Injectable()
], PasswordService);
export { PasswordService };
//# sourceMappingURL=password.service.js.map