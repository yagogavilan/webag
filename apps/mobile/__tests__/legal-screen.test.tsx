import { screen } from '@testing-library/react-native';
import LegalScreen from '../app/legal/[type]';
import { WEB_PUBLIC_URL } from '../src/features/checkout/config';
import { LegalBody } from '../src/features/legal/LegalBody';
import { fillLegal, parseLegal } from '../src/features/legal/legal-text';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock };

let mockReviewed = false;
jest.mock('../src/features/checkout/config', () => {
  const actual = jest.requireActual('../src/features/checkout/config');
  return new Proxy(actual, { get: (target, key) => (key === 'LEGAL_REVIEWED' ? mockReviewed : target[key]) });
});

const mockFetch = jest.fn();
jest.mock('../src/api/auth-api', () => ({ fetchCurrentLegalDocument: (...a: unknown[]) => mockFetch(...a) }));

const CONTENT = [
  '## 1. Quem somos',
  '',
  'A **Webag Tecnologia Ltda.** opera o app. Fale em [{{SITE_URL}}/termos/trocas]({{SITE_URL}}/termos/trocas) <script>alert(1)</script>.',
  '',
  '### 1.1 Contato',
  '',
  '- Encarregado: Fulana de Tal, privacidade@webag.example',
  '- Foro: comarca de Franco da Rocha, SP.',
  '- Antigo: {{DPO_EMAIL}}',
  '- Veja [a página de exclusão]({{SITE_URL}}/excluir-conta).',
  '',
  'Versão {{VERSAO}}. Em vigor desde {{VIGENCIA}}.',
].join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  mockReviewed = false;
  expoRouter.useLocalSearchParams.mockReturnValue({ type: 'customer_terms' });
  mockFetch.mockResolvedValue({ id: 'd1', type: 'customer_terms', version: 2, title: 'Termos de Uso', content: CONTENT, effectiveAt: '2026-11-20T12:00:00Z' });
});

describe('Termos e privacidade no app (WB-117, DEC-080)', () => {
  it('mostra o texto completo estruturado: títulos como cabeçalhos, lista, sem Markdown cru nem variável solta', async () => {
    await renderScreen(<LegalScreen />);
    expect(await screen.findByRole('header', { name: '1. Quem somos' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: '1.1 Contato' })).toBeOnTheScreen();
    // BUG-031 / DEC-082: em revisão, o app mostra o mesmo aviso do site e não a versão solta
    expect(screen.getByTestId('legal.meta')).toHaveTextContent('Versão para revisão. Vigência a definir.');
    expect(screen.getByText('Versão 2. Vigência a definir.')).toBeOnTheScreen();
    expect(screen.getByText('Encarregado: Fulana de Tal, privacidade@webag.example')).toBeOnTheScreen();
    expect(screen.getByText('Foro: comarca de Franco da Rocha, SP.')).toBeOnTheScreen();
    // versão antiga (anterior ao SEC-187) com variável de empresa: visível como "a definir", nunca entre chaves
    expect(screen.getByText('Antigo: a definir')).toBeOnTheScreen();
    expect(screen.getByText(`Veja a página de exclusão (${WEB_PUBLIC_URL}/excluir-conta).`)).toBeOnTheScreen();
    expect(screen.queryByText(/\{\{|\*\*|^##/)).toBeNull();
  });

  it('texto aprovado pelo jurídico: sem aviso de revisão, com versão e vigência (igual ao site)', async () => {
    mockReviewed = true;
    await renderScreen(<LegalScreen />);
    expect(await screen.findByTestId('legal.meta')).toHaveTextContent('Versão 2. Em vigor desde 20 de novembro de 2026.');
    expect(screen.queryByText(/Versão para revisão/)).toBeNull();
  });

  it('privacidade também mostra o aviso em revisão', async () => {
    expoRouter.useLocalSearchParams.mockReturnValue({ type: 'privacy' });
    mockFetch.mockResolvedValue({ id: 'd2', type: 'privacy', version: 1, title: 'Política de Privacidade', content: '## 1. Dados', effectiveAt: '2026-11-20T12:00:00Z' });
    await renderScreen(<LegalScreen />);
    expect(await screen.findByTestId('legal.meta')).toHaveTextContent('Versão para revisão. Vigência a definir.');
  });

  it('HTML no texto aparece como texto e não há link clicável dentro do documento', async () => {
    await renderScreen(<LegalScreen />);
    expect(await screen.findByText(/<script>alert\(1\)<\/script>/)).toBeOnTheScreen();
    expect(screen.getByText(new RegExp(`${WEB_PUBLIC_URL.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/termos/trocas`))).toBeOnTheScreen();
  });
});

describe('Vigência no texto aprovado', () => {
  it('LegalBody mostra a data da versão quando o jurídico aprovou', async () => {
    await renderScreen(<LegalBody content="Versão {{VERSAO}}. Em vigor desde {{VIGENCIA}}." effectiveAt="2026-11-20T12:00:00Z" reviewed siteUrl="https://x.example" version={2} />);
    expect(screen.getByText('Versão 2. Em vigor desde 20 de novembro de 2026.')).toBeOnTheScreen();
  });
});

describe('legal-text', () => {
  it('variável desconhecida vira "a definir"; site e versão vêm do app', () => {
    expect(fillLegal('{{X_Y}} {{SITE_URL}} v{{VERSAO}}', { version: 3, siteUrl: 'https://webag.example/' })).toBe('a definir https://webag.example v3');
  });

  it('vigência: com o texto aprovado vem de effectiveAt (horário de Brasília); em revisão ou sem data, "Vigência a definir"', () => {
    const base = { version: 2, siteUrl: 'https://webag.example' };
    const text = 'Em vigor desde {{VIGENCIA}}.';
    expect(fillLegal(text, { ...base, reviewed: true, effectiveAt: '2026-11-20T12:00:00Z' })).toBe('Em vigor desde 20 de novembro de 2026.');
    // 01:00 UTC de 21/11 ainda é dia 20 em Brasília
    expect(fillLegal(text, { ...base, reviewed: true, effectiveAt: '2026-11-21T01:00:00Z' })).toBe('Em vigor desde 20 de novembro de 2026.');
    expect(fillLegal(text, { ...base, reviewed: false, effectiveAt: '2026-11-20T12:00:00Z' })).toBe('Vigência a definir.');
    expect(fillLegal(text, { ...base, reviewed: true, effectiveAt: 'lixo' })).toBe('Vigência a definir.');
    expect(fillLegal(text, { ...base, reviewed: true })).toBe('Vigência a definir.');
    expect(fillLegal('Vigência: {{VIGENCIA}}', { ...base, reviewed: true, effectiveAt: '2026-12-01T03:00:00Z' })).toBe('Vigência: 1 de dezembro de 2026');
  });

  it('listas e parágrafos em várias linhas', () => {
    expect(parseLegal('Linha 1\nlinha 2\n\n- a\n- b\n\n## T')).toEqual([
      { kind: 'p', text: 'Linha 1 linha 2' },
      { kind: 'li', text: 'a' },
      { kind: 'li', text: 'b' },
      { kind: 'h2', text: 'T' },
    ]);
  });
});
