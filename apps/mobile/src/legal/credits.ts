import { OFL_BRICOLAGE, OFL_FIGTREE } from './license-texts';

/**
 * Créditos de código aberto exibidos em Conta > Sobre o Webag > Licenças (DEC-055, onda-7-licencas.md). Mantenha em sincronia com
 * `THIRD_PARTY_NOTICES.md` e `apps/web/src/lib/licenses.ts`. Os textos das fontes são gerados dos arquivos dos pacotes
 * (`pnpm --filter @webag/mobile assets:licenses`). Conteúdo local: abre sem rede.
 */
export interface Credit {
  id: 'solar' | 'tabler' | 'bricolage' | 'figtree';
  group: 'icons' | 'fonts';
  name: string;
  by: string;
  /** Aviso de copyright, quando a licença exige reproduzi-lo. */
  copyright: string | null;
  /** Nome curto da licença para o rótulo do cartão. */
  licenseShort: string;
  licenseName: string;
  licenseUrl: string;
  projectUrl: string;
  /** Alterações feitas na obra (CC BY 4.0 exige declarar). */
  changes: string | null;
  /** Texto integral da licença. Nulo quando a licença é só um link (CC BY 4.0: o link oficial cumpre a exigência de URI). */
  fullText: string | null;
}

const MIT = (copyright: string): string => `MIT License

${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const TABLER_COPYRIGHT = 'Copyright (c) 2020-2024 Paweł Kuna';

export const CREDITS: readonly Credit[] = [
  {
    id: 'solar',
    group: 'icons',
    name: 'Solar Icon Set',
    by: '480 Design',
    copyright: null,
    licenseShort: 'CC BY 4.0',
    licenseName: 'Creative Commons Atribuição 4.0 Internacional (CC BY 4.0)',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.pt-br',
    projectUrl: 'https://github.com/480-Design/Solar-Icon-Set',
    changes: 'Os ícones foram convertidos em componentes do app e recoloridos.',
    fullText: null,
  },
  {
    id: 'tabler',
    group: 'icons',
    name: 'Tabler Icons',
    by: 'Paweł Kuna',
    copyright: TABLER_COPYRIGHT,
    licenseShort: 'MIT',
    licenseName: 'Licença MIT',
    licenseUrl: 'https://github.com/tabler/tabler-icons/blob/main/LICENSE',
    projectUrl: 'https://github.com/tabler/tabler-icons',
    changes: null,
    fullText: MIT(TABLER_COPYRIGHT),
  },
  {
    id: 'bricolage',
    group: 'fonts',
    name: 'Bricolage Grotesque',
    by: 'The Bricolage Grotesque Project Authors',
    copyright: 'Copyright 2022 The Bricolage Grotesque Project Authors (github.com/ateliertriay/bricolage)',
    licenseShort: 'SIL OFL 1.1',
    licenseName: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org',
    projectUrl: 'https://github.com/ateliertriay/bricolage',
    changes: null,
    fullText: OFL_BRICOLAGE,
  },
  {
    id: 'figtree',
    group: 'fonts',
    name: 'Figtree',
    by: 'The Figtree Project Authors',
    copyright: 'Copyright 2022 The Figtree Project Authors (github.com/erikdkennedy/figtree)',
    licenseShort: 'SIL OFL 1.1',
    licenseName: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org',
    projectUrl: 'https://github.com/erikdkennedy/figtree',
    changes: null,
    fullText: OFL_FIGTREE,
  },
];

export const creditById = (id: string): Credit | undefined => CREDITS.find((c) => c.id === id);
