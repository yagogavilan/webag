import { Injectable, type OnModuleInit } from '@nestjs/common';
import argon2 from 'argon2';
import { errors } from '../../platform/http/app-error.js';
import { COMMON_PASSWORDS } from './common-passwords.js';

/** SEC-001 / ADR-003: Argon2id m = 19 MiB, t = 2, p = 1. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MAX_LENGTH = 128;

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    // Hash de mentira para igualar o tempo de login com e-mail inexistente (SEC-004).
    this.dummyHash = await argon2.hash('webag-dummy-password-for-timing', ARGON2_OPTIONS);
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string | null, password: string): Promise<boolean> {
    if (!hash) {
      await this.verifyDummy(password);
      return false;
    }
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  async verifyDummy(password: string): Promise<void> {
    if (!this.dummyHash) this.dummyHash = await argon2.hash('webag-dummy-password-for-timing', ARGON2_OPTIONS);
    await argon2.verify(this.dummyHash, password).catch(() => false);
  }

  /** SEC-001: 422 para senha curta, longa demais ou comum/vazada. Nunca trunca. */
  assertPolicy(password: string, minLength: number): void {
    const fail = (message: string): never => {
      throw errors.unprocessable('WEAK_PASSWORD', 'Senha fraca', { detail: message, errors: [{ field: 'password', message }] });
    };
    if ([...password].length < minLength) fail(`Use pelo menos ${minLength} caracteres.`);
    if ([...password].length > PASSWORD_MAX_LENGTH) fail(`Use no máximo ${PASSWORD_MAX_LENGTH} caracteres.`);
    if (COMMON_PASSWORDS.has(password.toLowerCase())) fail('Essa senha é muito comum. Escolha outra.');
    if (/^(.)\1+$/.test(password)) fail('Evite repetir o mesmo caractere.');
  }
}
