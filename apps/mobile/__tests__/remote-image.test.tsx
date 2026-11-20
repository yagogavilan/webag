import { fireEvent, screen } from '@testing-library/react-native';
import { Pressable, Text as RNText } from 'react-native';
import { RemoteImage } from '../src/components/RemoteImage';
import { useToast } from '../src/components/Toast';
import { logoFallback, productFallback } from '../src/features/catalog/image';
import { renderScreen } from '../src/test/render';

describe('RemoteImage: sem foto vira objeto do kit v3, não quadrado cinza com glifo', () => {
  it('produto sem foto: peça da categoria do kit', async () => {
    await renderScreen(<RemoteImage fallback={productFallback('Camiseta básica algodão')} height={100} urls={{}} width={100} />);
    expect(screen.getByTestId('image.fallback-art', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('foto que falha ao carregar cai no mesmo objeto', async () => {
    await renderScreen(<RemoteImage alt="Camiseta" fallback={productFallback('Camiseta')} height={100} urls={{ '400': 'https://x.test/a.webp' }} width={100} />);
    expect(screen.queryByTestId('image.fallback-art', { includeHiddenElements: true })).toBeNull();
    await fireEvent(screen.getByLabelText('Camiseta'), 'error');
    expect(screen.getByTestId('image.fallback-art', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('logo de loja sem foto: iniciais na cor da loja', async () => {
    await renderScreen(<RemoteImage fallback={logoFallback('Patas & Cia Pet', '#4A6630')} height={48} urls={undefined} width={48} />);
    expect(screen.getByTestId('image.fallback-initials', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('P&', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});

describe('Toast', () => {
  function Harness({ withAction }: { withAction?: boolean }) {
    const toast = useToast();
    return (
      <Pressable onPress={() => toast.show('Aviso.', withAction ? { label: 'Desfazer', onPress: () => undefined } : undefined)}>
        <RNText>abrir</RNText>
      </Pressable>
    );
  }

  it('aviso sem ação deixa o toque passar (nunca cobre um CTA)', async () => {
    await renderScreen(<Harness />);
    await fireEvent.press(screen.getByText('abrir'));
    expect(screen.getByTestId('toast').props.pointerEvents).toBe('none');
  });

  it('aviso com ação captura o toque', async () => {
    await renderScreen(<Harness withAction />);
    await fireEvent.press(screen.getByText('abrir'));
    expect(screen.getByTestId('toast').props.pointerEvents).toBe('auto');
  });
});
