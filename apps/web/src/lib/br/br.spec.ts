import { describe, expect, it } from 'vitest';
import { documentError, isValidCnpj, isValidCpf } from './document';
import { isValidEmail, isValidPhone, maskCep, maskCnpj, maskCpf, maskPhone, suggestEmailDomain } from './mask';

describe('máscaras', () => {
  it.each([
    ['11999998888', '(11) 99999-8888'],
    ['1133334444', '(11) 3333-4444'],
    ['(11) 9', '(11) 9'],
    ['1', '(1'],
    ['', ''],
    ['119999988889999', '(11) 99999-8888'],
  ])('telefone %s vira %s', (input, expected) => expect(maskPhone(input)).toBe(expected));

  it('CEP, CPF e CNPJ numérico', () => {
    expect(maskCep('07900000')).toBe('07900-000');
    expect(maskCep('0790')).toBe('0790');
    expect(maskCpf('52998224725')).toBe('529.982.247-25');
    expect(maskCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('CNPJ aceita letras nas 12 primeiras posições e converte para maiúsculas', () => {
    expect(maskCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');
    expect(maskCnpj('12ABC34501DE')).toBe('12.ABC.345/01DE');
  });

  it('o DV do CNPJ não aceita letra', () => {
    expect(maskCnpj('12ABC34501DEXX')).toBe('12.ABC.345/01DE');
  });
});

describe('CPF', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('%s é válido', (v) => expect(isValidCpf(v)).toBe(true));
  it.each(['529.982.247-24', '111.111.111-11', '123', '', '000.000.000-00'])('%s é inválido', (v) => expect(isValidCpf(v)).toBe(false));
});

describe('CNPJ numérico e alfanumérico (R-18)', () => {
  it.each(['11.222.333/0001-81', '11222333000181', '11.444.777/0001-61'])('%s é válido', (v) => expect(isValidCnpj(v)).toBe(true));
  it.each(['11.222.333/0001-82', '00.000.000/0000-00', '11111111111111', '1122233300018', ''])('%s é inválido', (v) => expect(isValidCnpj(v)).toBe(false));

  it('valida o exemplo alfanumérico oficial (módulo 11, A = 17)', () => {
    // Exemplo da documentação pública da Receita: 12.ABC.345/01DE-35 (valor do caractere = ASCII - 48).
    expect(isValidCnpj('12ABC34501DE35')).toBe(true);
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidCnpj('12abc34501de35')).toBe(true);
    expect(isValidCnpj('12ABC34501DE34')).toBe(false);
  });

  it('mensagens da etapa 1', () => {
    expect(documentError('cpf', '123')).toBe('Confira o CPF.');
    expect(documentError('cnpj', '123')).toBe('Confira o CNPJ. Os números não conferem.');
    expect(documentError('cpf', '52998224725')).toBeUndefined();
  });
});

describe('telefone e e-mail', () => {
  it.each(['(11) 99999-8888', '11 3333-4444'])('%s é válido', (v) => expect(isValidPhone(v)).toBe(true));
  it.each(['(11) 89999-8888', '(05) 99999-8888', '999', ''])('%s é inválido', (v) => expect(isValidPhone(v)).toBe(false));

  it('sugere o domínio certo para erro comum de digitação', () => {
    expect(suggestEmailDomain('ana@gmial.com')).toBe('gmail.com');
    expect(suggestEmailDomain('ana@casabela.com.br')).toBeNull();
    expect(isValidEmail('ana@casabela.com.br')).toBe(true);
    expect(isValidEmail('ana@casabela')).toBe(false);
  });
});
