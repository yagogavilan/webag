import { csvCell } from '../../../platform/http/csv.js';
import { cleanLine, cleanMultiline } from './text.js';

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

  it('C8: o que o lojista cola sai neutralizado em QUALQUER CSV (o `csvCell` único da plataforma, SEC-156)', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+55 11')).toBe("'+55 11");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-2')).toBe("'-2");
  });
});
