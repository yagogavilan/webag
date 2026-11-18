import { suggestEmailDomain, maskEmail, isEmail } from '../src/lib/email';
import { formatClock, formatCountdown, formatMoney } from '../src/lib/format';
import { isValidCep, isValidCpf, isValidMobilePhone, maskCep, maskCpf, maskPhone, onlyDigits } from '../src/lib/masks';
import { isAcceptablePassword, passwordStrength } from '../src/lib/password';
import { t } from '../src/i18n';

describe('máscaras', () => {
  it('formata CPF, CEP e celular enquanto digita', () => {
    expect(maskCpf('12345678909')).toBe('123.456.789-09');
    expect(maskCpf('1234')).toBe('123.4');
    expect(maskCep('01310100')).toBe('01310-100');
    expect(maskCep('0131')).toBe('0131');
    expect(maskPhone('11999998888')).toBe('(11) 99999-8888');
    expect(maskPhone('119')).toBe('(11) 9');
    expect(maskPhone('+5511999998888')).toBe('(11) 99999-8888');
    expect(maskPhone('')).toBe('');
    expect(onlyDigits('(11) 9-ab')).toBe('119');
  });

  it('valida CPF por dígito verificador', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-26')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
  });

  it('valida CEP (8 dígitos) e celular com DDD', () => {
    expect(isValidCep('07900-000')).toBe(true);
    expect(isValidCep('0790')).toBe(false);
    expect(isValidMobilePhone('(11) 99999-8888')).toBe(true);
    expect(isValidMobilePhone('(11) 3333-4444')).toBe(false);
    expect(isValidMobilePhone('(01) 99999-8888')).toBe(false);
  });
});

describe('senha', () => {
  it('mede a força em texto e segmentos', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: 'weak' });
    expect(passwordStrength('12345678').label).toBe('weak');
    expect(passwordStrength('abc12345').label).toBe('weak');
    expect(passwordStrength('Cachorro2024').label).toBe('medium');
    expect(passwordStrength('Cachorro-Azul-2024!').label).toBe('strong');
  });

  it('exige 8+ caracteres com letras e números', () => {
    expect(isAcceptablePassword('abcdefgh')).toBe(false);
    expect(isAcceptablePassword('abc123')).toBe(false);
    expect(isAcceptablePassword('abcdef12')).toBe(true);
  });
});

describe('e-mail', () => {
  it('sugere o domínio popular quando há erro de digitação', () => {
    expect(suggestEmailDomain('ana@gmial.com')).toBe('gmail.com');
    expect(suggestEmailDomain('ana@hotmial.com')).toBe('hotmail.com');
    expect(suggestEmailDomain('ana@gmail.com')).toBeNull();
    expect(suggestEmailDomain('ana@empresa.com.br')).toBeNull();
    expect(suggestEmailDomain('semarroba')).toBeNull();
  });

  it('valida formato e mascara', () => {
    expect(isEmail('ana@x.com')).toBe(true);
    expect(isEmail('ana@x')).toBe(false);
    expect(maskEmail('maria@gmail.com')).toBe('m***@gmail.com');
  });
});

describe('formatação e i18n', () => {
  it('formata moeda, relógio e contagem', () => {
    expect(formatMoney(123456)).toBe('R$ 1.234,56');
    expect(formatMoney(0, { freeLabel: true })).toBe('Grátis');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(9)).toBe('0:09');
    expect(formatClock(new Date(2026, 0, 1, 14, 7).getTime())).toBe('14:07');
  });

  it('interpola parâmetros', () => {
    expect(t('otp.verifyText', { email: 'a@b.com' })).toBe('Enviamos um código de 6 dígitos para a@b.com.');
    expect(t('login.waitText', { time: '14:47' })).toBe('Tente de novo às 14:47 ou redefina a senha.');
  });
});
