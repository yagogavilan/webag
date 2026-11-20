import { screen } from '@testing-library/react-native';
import LegalScreen from '../app/legal/[type]';
import { WEB_PUBLIC_URL } from '../src/features/checkout/config';
import { fillLegal, parseLegal } from '../src/features/legal/legal-text';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { useLocalSearchParams: jest.Mock };

const mockFetch = jest.fn();
jest.mock('../src/api/auth-api', () => ({ fetchCurrentLegalDocument: (...a: unknown[]) => mockFetch(...a) }));

const CONTENT = [
  '## 1. Quem somos',
  '',
  'A **{{COMPANY_NAME}}** opera o app. Fale em [{{SITE_URL}}/termos/trocas]({{SITE_URL}}/termos/trocas) <script>alert(1)</script>.',
  '',
  '### 1.1 Contato',
  '',
  '- Encarregado: {{DPO_EMAIL}}',
  '- Veja [a página de exclusão]({{SITE_URL}}/excluir-conta).',
  '',
  'Versão {{VERSAO}}. Em vigor desde {{VIGENCIA}}.',
].join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  expoRouter.useLocalSearchParams.mockReturnValue({ type: 'customer_terms' });
  mockFetch.mockResolvedValue({ id: 'd1', type: 'customer_terms', version: 2, title: 'Termos de Uso', content: CONTENT, effectiveAt: '2026-11-20T12:00:00Z' });
});

describe('Termos e privacidade no app (WB-117, DEC-080)', () => {
  it('mostra o texto completo estruturado: títulos como cabeçalhos, lista, sem Markdown cru nem variável solta', async () => {
    await renderScreen(<LegalScreen />);
    expect(await screen.findByRole('header', { name: '1. Quem somos' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: '1.1 Contato' })).toBeOnTheScreen();
    expect(screen.getByText('Versão 2')).toBeOnTheScreen();
    expect(screen.getByText('Versão 2. Vigência a definir.')).toBeOnTheScreen();
    expect(screen.getByText(`Encarregado: a definir`)).toBeOnTheScreen();
    expect(screen.getByText(`Veja a página de exclusão (${WEB_PUBLIC_URL}/excluir-conta).`)).toBeOnTheScreen();
    expect(screen.queryByText(/\{\{|\*\*|^##/)).toBeNull();
  });

  it('HTML no texto aparece como texto e não há link clicável dentro do documento', async () => {
    await renderScreen(<LegalScreen />);
    expect(await screen.findByText(/<script>alert\(1\)<\/script>/)).toBeOnTheScreen();
    expect(screen.getByText(new RegExp(`${WEB_PUBLIC_URL.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/termos/trocas`))).toBeOnTheScreen();
  });
});

describe('legal-text', () => {
  it('variável desconhecida vira "a definir"; site e versão vêm do app', () => {
    expect(fillLegal('{{X_Y}} {{SITE_URL}} v{{VERSAO}}', { version: 3, siteUrl: 'https://webag.example/' })).toBe('a definir https://webag.example v3');
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
