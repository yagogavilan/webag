import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LegalPage } from './legal-page';

const doc = { id: 'd1', type: 'customer_terms' as const, version: 4, title: 'Termos de uso', content: '## 1. Uso\n\nTexto com **destaque** e <script>alert(1)</script>.\n\n- um\n- dois', effectiveAt: '2026-11-19T12:00:00.000Z' };

describe('LegalPage', () => {
  it('mostra título, versão e data de vigência do texto publicado', () => {
    render(<LegalPage loaded={{ status: 'ok', data: doc }} fallbackTitle="Termos de uso" testId="t" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Termos de uso' })).toBeInTheDocument();
    expect(screen.getByTestId('t.version')).toHaveTextContent('Versão 4. Em vigor desde 19 de novembro de 2026.');
    expect(screen.getByRole('heading', { level: 2, name: '1. Uso' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
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
