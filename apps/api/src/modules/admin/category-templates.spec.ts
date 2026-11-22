import { INITIAL_CATEGORY_TEMPLATES, initialTemplateFor } from './category-templates.js';

describe('modelos iniciais por categoria (RN-Q6, WB-375)', () => {
  it('são os 8 modelos do PRD, com Cosméticos e Eletrônicos exigindo descrição (DEC-106) e mais nenhum', () => {
    expect(INITIAL_CATEGORY_TEMPLATES.map((m) => m.model)).toEqual(['Moda e vestuário', 'Calçados', 'Cosméticos e perfumaria', 'Eletrônicos e acessórios', 'Casa e utilidades', 'Papelaria', 'Pet', 'Presentes']);
    expect(INITIAL_CATEGORY_TEMPLATES.filter((m) => m.descriptionRequired).map((m) => m.model)).toEqual(['Cosméticos e perfumaria', 'Eletrônicos e acessórios']);
  });

  it('C1: calçados sugere os tamanhos 34 a 44 e lembra a tabela de medidas', () => {
    const shoes = initialTemplateFor('Moda e calçados', 'Calçados')!;
    expect(shoes.template.attributes[0]).toEqual({ name: 'Tamanho', values: ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44'] });
    expect(shoes.template.sizeChartHint).toBe(true);
  });

  it('C2/C3: cosméticos sugere volume e marca e marca "sem troca voluntária" como sugestão; moda sugere P a GG', () => {
    const cosmetics = initialTemplateFor('Farmácia', 'Cuidados pessoais')!;
    expect(cosmetics.template.attributes.map((a) => a.name)).toEqual(['Volume', 'Marca']);
    expect(cosmetics.template.noVoluntaryExchangeHint).toBe(true);
    expect(initialTemplateFor(null, 'Moda e calçados')!.template.attributes[0]!.values).toEqual(['P', 'M', 'G', 'GG']);
  });

  it('casa por pai e nome, sem acento nem caixa; o mesmo nome em outro pai não casa (Acessórios de Pet x de Moda)', () => {
    expect(initialTemplateFor(null, 'ELETRONICOS')!.model).toBe('Eletrônicos e acessórios');
    expect(initialTemplateFor('Pet', 'Acessórios')!.model).toBe('Pet');
    expect(initialTemplateFor('Moda e calçados', 'Acessórios')!.model).toBe('Moda e vestuário');
    expect(initialTemplateFor('Mercado', 'Acessórios')).toBeUndefined();
  });

  it('C5: categoria sem modelo não tem sugestão; nenhum valor vem marcado e nada passa dos limites do contrato (12 atributos, 30 valores, 30/40 caracteres)', () => {
    expect(initialTemplateFor(null, 'Mercado')).toBeUndefined();
    for (const { template } of INITIAL_CATEGORY_TEMPLATES) {
      expect(template.attributes.length).toBeLessThanOrEqual(12);
      for (const attribute of template.attributes) {
        expect(attribute.name.length).toBeLessThanOrEqual(30);
        expect(attribute.values.length).toBeLessThanOrEqual(30);
        for (const value of attribute.values) expect(value.length).toBeLessThanOrEqual(40);
      }
    }
  });
});
