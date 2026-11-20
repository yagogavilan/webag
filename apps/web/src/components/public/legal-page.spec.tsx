import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LegalPage } from './legal-page';

const doc = { id: 'd1', type: 'customer_terms' as const, version: 4, title: 'Termos de uso', content: '## 1. Uso\n\nTexto com **destaque** e <script>alert(1)</script>.\n\n- um\n- dois', effectiveAt: '2026-11-19T12:00:00.000Z' };

describe('LegalPage', () => {
  it('mostra título, versão e data de vigência quando o jurídico já aprovou', () => {
    render(<LegalPage loaded={{ status: 'ok', data: doc }} fallbackTitle="Termos de uso" testId="t" reviewed />);
    expect(screen.getByRole('heading', { level: 1, name: 'Termos de uso' })).toBeInTheDocument();
    expect(screen.getByTestId('t.version')).toHaveTextContent('Versão 4. Em vigor desde 19 de novembro de 2026.');
    expect(screen.getByRole('heading', { level: 2, name: '1. Uso' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('em revisão (padrão): aviso discreto e honesto, sem versão nem data, sem a palavra minuta', () => {
    const { container } = render(<LegalPage loaded={{ status: 'ok', data: doc }} fallbackTitle="Termos de uso" testId="t" />);
    expect(screen.getByTestId('t.version')).toHaveTextContent('Versão para revisão. Vigência a definir.');
    expect(container.textContent).not.toMatch(/Minuta|minuta|Em vigor desde/);
  });

  it('índice com âncoras para as seções numeradas e variáveis preenchidas pelo ambiente', () => {
    const content = '## 1. Quem somos\n\nA {{COMPANY_NAME}} (CNPJ {{COMPANY_CNPJ}}) opera o app.\n\n### 1.1 Contato\n\nFale em [{{SITE_URL}}/ajuda]({{SITE_URL}}/ajuda).\n\n## 2. Sua conta\n\nTexto.\n\nVersão {{VERSAO}}. Em vigor desde {{VIGENCIA}}.';
    const variables = { COMPANY_NAME: 'Webag Exemplo Ltda', COMPANY_CNPJ: '00.000.000/0001-00', SITE_URL: 'https://webag.example', VERSAO: '4', VIGENCIA: 'a definir' };
    render(<LegalPage loaded={{ status: 'ok', data: { ...doc, content } }} fallbackTitle="x" testId="t" variables={variables} />);
    const toc = screen.getByTestId('t.toc');
    expect(toc.querySelectorAll('a')).toHaveLength(2);
    expect(toc.querySelector('a[href="#secao-2"]')).toHaveTextContent('2. Sua conta');
    expect(screen.getByRole('heading', { level: 2, name: '1. Quem somos' })).toHaveAttribute('id', 'secao-1');
    expect(screen.getByRole('heading', { level: 3, name: '1.1 Contato' })).toHaveAttribute('id', 'secao-1-1');
    expect(screen.getByText(/A Webag Exemplo Ltda \(CNPJ 00\.000\.000\/0001-00\) opera o app\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://webag.example/ajuda' })).toHaveAttribute('href', 'https://webag.example/ajuda');
    expect(screen.getByText('Versão 4. Vigência a definir.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('{{');
  });

  it('HTML colado no texto aparece como texto, nunca é interpretado', () => {
    const { container } = render(<LegalPage loaded={{ status: 'ok', data: doc }} fallbackTitle="x" testId="t" />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('sem versão publicada ou com a API fora, avisa sem quebrar', () => {
    const { rerender } = render(<LegalPage loaded={{ status: 'missing' }} fallbackTitle="Política de privacidade" testId="t" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Política de privacidade' })).toBeInTheDocument();
    expect(screen.getByTestId('t.unavailable')).toHaveTextContent('ainda não foi publicado');
    rerender(<LegalPage loaded={{ status: 'unavailable' }} fallbackTitle="Política de privacidade" testId="t" />);
    expect(screen.getByTestId('t.unavailable')).toHaveTextContent('Não conseguimos carregar');
  });
});
