import { escapeLike, maskEmail, maskName, maskPhone } from './pii-mask.js';

describe('máscaras do admin', () => {
  it('nome: primeiro nome e a inicial do último; nome único e vazio', () => {
    expect(maskName('Maria Souza Lima')).toBe('Maria L.');
    expect(maskName('  joão   silva ')).toBe('joão S.');
    expect(maskName('Madonna')).toBe('Madonna');
    expect(maskName(null)).toBe('');
  });
  it('e-mail e telefone', () => {
    expect(maskEmail('maria@gmail.com')).toBe('m***@gmail.com');
    expect(maskEmail(null)).toBeNull();
    expect(maskPhone('11999998888')).toBe('(11) 9****-8888');
    expect(maskPhone('1133334444')).toBe('(11) ****-4444');
    expect(maskPhone('12345')).toBe('****2345');
    expect(maskPhone('12')).toBeNull();
    expect(maskPhone(null)).toBeNull();
  });
  it('a busca por trecho não aceita curinga do usuário', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});
