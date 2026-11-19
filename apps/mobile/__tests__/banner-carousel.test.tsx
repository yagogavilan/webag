import { fireEvent, screen } from '@testing-library/react-native';
import { BannerCarousel } from '../src/features/catalog/BannerCarousel';
import { renderScreen } from '../src/test/render';

const banner = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, title: `Banner ${id}`, image: { urls: {} }, destination: { type: 'store', id: 's1', code: null }, ...over }) as never;

describe('U8.3. BannerCarousel: pontos no lugar das setas', () => {
  it('3 banners: 3 pontos (o ativo marcado), sem setas nem "1 / 3", e o toque no banner abre o destino', async () => {
    const onOpen = jest.fn();
    await renderScreen(<BannerCarousel banners={[banner('b1'), banner('b2'), banner('b3')]} onOpen={onOpen} />);
    expect(screen.getByTestId('home.banner-dots', { includeHiddenElements: true }).children).toHaveLength(3);
    expect(screen.getByTestId('home.banner-dot-active', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByTestId('home.banner-prev')).toBeNull();
    expect(screen.queryByTestId('home.banner-next')).toBeNull();
    expect(screen.queryByText('1 / 3')).toBeNull();
    await fireEvent.press(screen.getByTestId('home.banner-b1'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('leitor de tela: valor "Banner 1 de 3" e ações Próximo/Anterior; os pontos ficam fora da árvore de acessibilidade', async () => {
    await renderScreen(<BannerCarousel banners={[banner('b1'), banner('b2'), banner('b3')]} onOpen={jest.fn()} />);
    const group = screen.getByTestId('home.banners');
    expect(group.props.accessibilityValue).toEqual({ text: 'Banner 1 de 3' });
    expect(group.props.accessibilityActions.map((a: { label: string }) => a.label)).toEqual(['Próximo banner', 'Banner anterior']);
    await fireEvent(group, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(screen.getByTestId('home.banners').props.accessibilityValue).toEqual({ text: 'Banner 2 de 3' });
    expect(screen.getByTestId('home.banner-dots', { includeHiddenElements: true }).props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('um banner só: sem pontos', async () => {
    await renderScreen(<BannerCarousel banners={[banner('b1')]} onOpen={jest.fn()} />);
    expect(screen.queryByTestId('home.banner-dots', { includeHiddenElements: true })).toBeNull();
  });

  it('banner sem arte (ou arte que não carregou): desenho do kit com título e botão, nunca caixa vazia', async () => {
    await renderScreen(
      <BannerCarousel
        banners={[banner('b1', { title: 'Tudo para o seu mercado', destination: { type: 'category', id: 'c1', code: null } }), banner('b2', { title: 'Sem destino', destination: { type: 'none', id: null, code: null } })]}
        onOpen={jest.fn()}
      />,
    );
    expect(screen.getAllByTestId('home.banner-art', { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.getByText('Tudo para o seu mercado', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('Ver categoria', { includeHiddenElements: true })).toBeOnTheScreen();
    // sem destino não há botão (o banner não é tocável)
    expect(screen.getByText('Sem destino', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getAllByText(/Ver |Usar /, { includeHiddenElements: true })).toHaveLength(1);
  });

  it('cupom: o código aparece como adesivo e o botão diz "Usar cupom"', async () => {
    await renderScreen(<BannerCarousel banners={[banner('b1', { title: 'Frete grátis', destination: { type: 'coupon', id: null, code: 'FRETEGRATIS' } })]} onOpen={jest.fn()} />);
    expect(screen.getByText('FRETEGRATIS', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('Usar cupom', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});
