import { isValidEmail } from './br/mask';

/** Confere o formato do e-mail antes de gastar uma chamada (a API valida de novo). */
export const isEmailLike = (value: string): boolean => isValidEmail(value);
