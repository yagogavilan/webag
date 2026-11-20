import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Home from '../../../app/(publico)/page';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Home do site: botões das lojas', () => {
  it('sem URL configurada mostra "Em breve nas lojas" e nenhum placeholder entre colchetes', () => {
    vi.stubEnv('PLAY_STORE_URL', '');
    vi.stubEnv('APP_STORE_URL', '');
    const { container } = render(<Home />);
    expect(screen.getByTestId('public.home.soon')).toHaveTextContent('Em breve nas lojas');
    expect(screen.queryByTestId('public.home.play')).toBeNull();
    expect(screen.queryByTestId('public.home.apple')).toBeNull();
    expect(container.textContent).not.toMatch(/\[link da/);
  });

  it('com URLs https configuradas mostra os dois botões oficiais e some o aviso', () => {
    vi.stubEnv('PLAY_STORE_URL', 'https://play.google.com/store/apps/details?id=br.com.webag');
    vi.stubEnv('APP_STORE_URL', 'https://apps.apple.com/br/app/webag/id1');
    render(<Home />);
    expect(screen.getByTestId('public.home.play')).toHaveAttribute('href', expect.stringMatching(/^https:\/\//));
    expect(screen.getByTestId('public.home.apple')).toHaveAttribute('href', expect.stringMatching(/^https:\/\//));
    expect(screen.queryByTestId('public.home.soon')).toBeNull();
  });
});
