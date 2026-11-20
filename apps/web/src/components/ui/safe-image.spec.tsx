import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeImage } from './safe-image';

describe('SafeImage', () => {
  it('com foto mostra a imagem e o texto alternativo', () => {
    render(<SafeImage src="https://img.test/a.webp" alt="Camiseta: foto 1" testId="foto" />);
    expect(screen.getByAltText('Camiseta: foto 1')).toBeInTheDocument();
  });

  it('com erro de carregamento troca pelo objeto da marca e não deixa o texto alternativo na tela', () => {
    render(<SafeImage src="https://img.test/quebrada.webp" alt="Camiseta: foto 1" showLabel testId="foto" />);
    fireEvent.error(screen.getByAltText('Camiseta: foto 1'));
    expect(screen.queryByAltText('Camiseta: foto 1')).toBeNull();
    expect(screen.getByTestId('foto-fallback')).toBeInTheDocument();
    expect(screen.getByText('Sem foto')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Sem foto: Camiseta: foto 1' })).toBeInTheDocument();
  });

  it('sem endereço mostra o objeto da marca direto', () => {
    render(<SafeImage src={null} alt="" testId="foto" />);
    expect(screen.getByRole('img', { name: 'Sem foto' })).toBeInTheDocument();
  });
});
