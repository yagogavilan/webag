import { cleanLine, cleanMultiline, csvCell } from './text.js';

const chr = (code: number): string => String.fromCharCode(code);

describe('texto puro do cadastro (C-CAD-04)', () => {
  it.each([
    ['  Camiseta   básica  ', 'Camiseta básica'],
    ['Cami\u0000seta\u0007', 'Camiseta'],
    ['Bermuda\tjeans\nM', 'Bermuda jeans M'],
    ['Nome' + chr(0x202e) + 'gnirts', 'Nomegnirts'],
    ['a' + chr(0x200b) + 'b' + chr(0xfeff) + 'c', 'abc'],
    ['=HYPERLINK("http://x")', '=HYPERLINK("http://x")'], // não é "escapado" ao gravar: é só texto
    ['<script>alert(1)</script>', '<script>alert(1)</script>'],
    ['', ''],
  ])('cleanLine(%j) = %j', (input, expected) => {
    expect(cleanLine(input)).toBe(expected);
  });

  it('descrição mantém a quebra de linha, tira o controle e limita as linhas em branco', () => {
    expect(cleanMultiline('Linha 1\r\nLinha\u0000 2\n\n\n\nLinha 3\t\t fim')).toBe('Linha 1\nLinha 2\n\nLinha 3 fim');
  });

  it.each([
    ['=1+1', `"'=1+1"`],
    ['+55 11', `"'+55 11"`],
    ['-2', `"'-2"`],
    ['@SUM(A1)', `"'@SUM(A1)"`],
    ['Camiseta', 'Camiseta'],
    ['a,b', '"a,b"'],
    ['diz "oi"', '"diz ""oi"""'],
    [null, ''],
    [49.9, '49.9'],
  ])('csvCell(%j) = %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });
});
