import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import AboutScreen, { versionLabel } from '../app/about';
import AccountScreen from '../app/(customer)/(tabs)/account';
import LicenseDetailScreen from '../app/licenses/[id]';
import LicensesScreen from '../app/licenses/index';
import { assertWebUrl } from '../app.config';
import { sessionStore } from '../src/api/session';
import { WEB_PUBLIC_URL } from '../src/features/checkout/config';
import { CREDITS } from '../src/legal/credits';
import { renderScreen } from '../src/test/render';

const expoRouter = jest.requireMock('expo-router') as { __router: { push: jest.Mock }; useLocalSearchParams: jest.Mock };
const router = expoRouter.__router;
const Clipboard = jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock };

let openURL: jest.SpyInstance;
beforeEach(async () => {
  jest.clearAllMocks();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
  await sessionStore.clear();
});

describe('Sobre o Webag (CC1)', () => {
  it('a Conta tem o item Sobre o Webag, que abre a tela', async () => {
    await renderScreen(<AccountScreen />);
    await fireEvent.press(screen.getByTestId('account.item-about'));
    expect(router.push).toHaveBeenCalledWith('/about');
  });

  it('Termos e Política abrem as páginas públicas da EXPO_PUBLIC_WEB_URL no navegador do sistema', async () => {
    await renderScreen(<AboutScreen />);
    await fireEvent.press(screen.getByTestId('about.terms'));
    await fireEvent.press(screen.getByTestId('about.policy'));
    expect(openURL).toHaveBeenNthCalledWith(1, `${WEB_PUBLIC_URL}/termos`);
    expect(openURL).toHaveBeenNthCalledWith(2, `${WEB_PUBLIC_URL}/privacidade`);
  });

  it('Licenças abre a lista; toque longo na versão copia', async () => {
    await renderScreen(<AboutScreen />);
    await fireEvent.press(screen.getByTestId('about.licenses'));
    expect(router.push).toHaveBeenCalledWith('/licenses');
    await fireEvent(screen.getByTestId('about.version'), 'longPress');
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalled());
    expect(await screen.findByText('Versão copiada.')).toBeOnTheScreen();
  });

  it('link que não abre mostra o endereço e deixa copiar', async () => {
    openURL.mockRejectedValueOnce(new Error('sem navegador'));
    await renderScreen(<AboutScreen />);
    await fireEvent.press(screen.getByTestId('about.terms'));
    expect(await screen.findByText('Não conseguimos abrir o link.')).toBeOnTheScreen();
    expect(screen.getByText(`Endereço: ${WEB_PUBLIC_URL}/termos`)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('legal.link-copy'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(`${WEB_PUBLIC_URL}/termos`);
  });

  it('versão com e sem número de build', () => {
    expect(versionLabel('1.0.0', '123')).toBe('Versão 1.0.0 (123)');
    expect(versionLabel('1.0.0', null)).toBe('Versão 1.0.0');
  });
});

describe('Licenças de código aberto (DEC-055)', () => {
  it('Solar: atribuição CC BY 4.0 com autor, alteração, aviso de garantia e links', async () => {
    await renderScreen(<LicensesScreen />);
    expect(screen.getByText('Solar Icon Set')).toBeOnTheScreen();
    expect(screen.getByText('Por 480 Design')).toBeOnTheScreen();
    expect(screen.getByText('Creative Commons Atribuição 4.0 Internacional (CC BY 4.0)')).toBeOnTheScreen();
    expect(screen.getByText('Alterações: Os ícones foram convertidos em componentes do app e recoloridos.')).toBeOnTheScreen();
    expect(screen.getByText('A obra é oferecida como está, sem garantias. Veja a licença para os detalhes.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('licenses.solar-license'));
    expect(openURL).toHaveBeenCalledWith('https://creativecommons.org/licenses/by/4.0/deed.pt-br');
    await fireEvent.press(screen.getByTestId('licenses.solar-project'));
    expect(openURL).toHaveBeenCalledWith('https://github.com/480-Design/Solar-Icon-Set');
  });

  it('fontes OFL com copyright e a lista de bibliotecas na página pública', async () => {
    await renderScreen(<LicensesScreen />);
    expect(screen.getByText('Bricolage Grotesque')).toBeOnTheScreen();
    expect(screen.getByText('Figtree')).toBeOnTheScreen();
    expect(screen.getByText(/Copyright 2022 The Figtree Project Authors/)).toBeOnTheScreen();
    expect(screen.getAllByText('SIL Open Font License 1.1')).toHaveLength(2);
    await fireEvent.press(screen.getByTestId('licenses.libs-open'));
    expect(openURL).toHaveBeenCalledWith(`${WEB_PUBLIC_URL}/licencas`);
  });

  it('cada cartão abre o detalhe; o detalhe da fonte traz o texto integral da OFL', async () => {
    await renderScreen(<LicensesScreen />);
    await fireEvent.press(screen.getByTestId('licenses.figtree-open'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/licenses/[id]', params: { id: 'figtree' } });
    expect(CREDITS.map((c) => c.id)).toEqual(['solar', 'tabler', 'bricolage', 'figtree']);

    expoRouter.useLocalSearchParams.mockReturnValue({ id: 'figtree' });
    await renderScreen(<LicenseDetailScreen />);
    const text = screen.getByTestId('license-detail.text').props.children as string;
    expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
    expect(text).toContain('PERMISSION & CONDITIONS');
  });

  it('sem conexão, o link externo avisa e o texto continua na tela', async () => {
    const { useNetworkState } = jest.requireMock('expo-network') as { useNetworkState: jest.Mock };
    useNetworkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    await renderScreen(<LicensesScreen />);
    await fireEvent.press(screen.getByTestId('licenses.solar-license'));
    expect(await screen.findByText('Sem conexão. O texto da licença está aqui mesmo.')).toBeOnTheScreen();
    expect(openURL).not.toHaveBeenCalled();
    useNetworkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
  });
});

describe('EXPO_PUBLIC_WEB_URL nos builds de loja', () => {
  it('perfis preview e production recusam URL ausente, de exemplo, localhost ou http', () => {
    for (const bad of [undefined, '', 'https://SEU-DOMINIO', 'http://webag.com.br', 'https://localhost:3001', 'https://10.0.2.2']) {
      expect(() => assertWebUrl('production', bad)).toThrow(/EXPO_PUBLIC_WEB_URL/);
      expect(() => assertWebUrl('preview', bad)).toThrow(/EXPO_PUBLIC_WEB_URL/);
    }
  });

  it('aceita https real e não interfere no desenvolvimento nem no export local', () => {
    expect(() => assertWebUrl('production', 'https://webag.example.org')).not.toThrow();
    expect(() => assertWebUrl('development', 'http://localhost:3001')).not.toThrow();
    expect(() => assertWebUrl(undefined, undefined)).not.toThrow();
  });
});
