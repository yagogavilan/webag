/**
 * Créditos de código aberto exibidos em `/licencas` (e, no app, em Conta > Sobre). Mantenha em sincronia com `THIRD_PARTY_NOTICES.md`
 * na raiz do repositório (DEC-055). Solar exige atribuição (CC BY 4.0); as fontes são OFL 1.1; bibliotecas são MIT.
 */
export interface LicenseEntry {
  id: string;
  name: string;
  author: string;
  use: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  note?: string;
}

export const LICENSES: LicenseEntry[] = [
  {
    id: 'solar',
    name: 'Solar Icon Set',
    author: '480 Design',
    use: 'Ícones do aplicativo (estilos linear, bold e bold duotone). Os ícones foram recortados e recoloridos para o app.',
    license: 'Creative Commons Atribuição 4.0 Internacional (CC BY 4.0)',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sourceUrl: 'https://github.com/480-Design/Solar-Icon-Set',
    note: 'Distribuído também pelo Iconify (https://icon-sets.iconify.design/solar/).',
  },
  {
    id: 'bricolage',
    name: 'Bricolage Grotesque',
    author: 'The Bricolage Grotesque Project Authors',
    use: 'Fonte dos títulos.',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org',
    sourceUrl: 'https://github.com/ateliertriay/bricolage',
  },
  {
    id: 'figtree',
    name: 'Figtree',
    author: 'The Figtree Project Authors',
    use: 'Fonte do texto.',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org',
    sourceUrl: 'https://github.com/erikdkennedy/figtree',
  },
  {
    id: 'outfit',
    name: 'Outfit',
    author: 'The Outfit Project Authors',
    use: 'Fonte de materiais de marca e das telas antigas do painel.',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org',
    sourceUrl: 'https://github.com/Outfitio/Outfit-Fonts',
  },
  {
    id: 'fredoka',
    name: 'Fredoka',
    author: 'The Fredoka Project Authors',
    use: 'Fonte de materiais de marca.',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'https://openfontlicense.org',
    sourceUrl: 'https://github.com/hafontia-zz/Fredoka-Font',
  },
  {
    id: 'tabler',
    name: 'Tabler Icons (logotipo do WhatsApp)',
    author: 'Paweł Kuna',
    use: 'Ícone do WhatsApp nos botões de contato.',
    license: 'MIT',
    licenseUrl: 'https://opensource.org/license/mit',
    sourceUrl: 'https://github.com/tabler/tabler-icons',
  },
  {
    id: 'phosphor',
    name: 'Phosphor Icons',
    author: 'Phosphor Icons',
    use: 'Ícones dos painéis web.',
    license: 'MIT',
    licenseUrl: 'https://opensource.org/license/mit',
    sourceUrl: 'https://github.com/phosphor-icons/react',
  },
];
