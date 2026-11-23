import { normalizeEmailForFraud } from './email.js';

describe('SEC-226: e-mail normalizado para o antifraude', () => {
  it.each([
    ['a.b+1@gmail.com', 'ab@gmail.com'],
    ['AB@Gmail.com', 'ab@gmail.com'],
    ['a.b@googlemail.com', 'ab@gmail.com'],
    ['nome+promo@outlook.com', 'nome@outlook.com'],
    ['nome.sobrenome@empresa.com.br', 'nome.sobrenome@empresa.com.br'], // fora do Gmail os pontos contam
    ['  Fulano@Exemplo.COM ', 'fulano@exemplo.com'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeEmailForFraud(input)).toBe(expected);
  });
  it('o que não parece e-mail devolve null', () => {
    expect(normalizeEmailForFraud('semarroba')).toBeNull();
    expect(normalizeEmailForFraud('+tag@gmail.com')).toBeNull();
    expect(normalizeEmailForFraud('a@')).toBeNull();
  });
});
