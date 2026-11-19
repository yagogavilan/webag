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
});
