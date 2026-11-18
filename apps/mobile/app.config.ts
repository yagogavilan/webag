import type { ExpoConfig } from 'expo/config';

/**
 * Configuração do app. Tudo aqui é embutido no binário (público): nada de segredo.
 * Variáveis por ambiente: EXPO_PUBLIC_* (ver infra/env.example) e perfis do EAS quando houver eas.json.
 */
const config: ExpoConfig = {
  name: 'Webag',
  slug: 'webag',
  scheme: 'webag',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'br.com.webag.app',
    supportsTablet: false,
  },
  android: {
    // Edge-to-edge é obrigatório no SDK atual: telas usam safe areas.
    package: 'br.com.webag.app',
    // SEC-012 / MASVS-STORAGE (revisão Onda 1, SEC-120): sem backup automático no Google Drive. Endereços (AsyncStorage) e o
    // id do aparelho não saem do aparelho; o SecureStore restaurado em outro aparelho não decifra e só geraria erro.
    allowBackup: false,
    // Só localização aproximada, só durante o uso (SEC-084, minimização). Revisar se o MapPinPicker exigir ponto preciso.
    blockedPermissions: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_BACKGROUND_LOCATION'],
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-splash-screen',
    'expo-secure-store',
    [
      'expo-location',
      {
        // Texto do diálogo do sistema. O app explica o motivo ANTES, em tela própria (design-system.md §5.6).
        locationWhenInUsePermission: 'O Webag usa sua localização só enquanto o app está aberto, para mostrar as lojas que entregam perto de você.',
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
  ],
  experiments: { typedRoutes: true },
};

export default config;
