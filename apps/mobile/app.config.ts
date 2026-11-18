import type { ExpoConfig } from 'expo/config';

/**
 * Configuração do app. Tudo aqui é embutido no binário (público): nada de segredo.
 * Variáveis por ambiente: EXPO_PUBLIC_* (infra/env.example no dev; EAS Environment Variables nos builds, ver eas.json e
 * docs/deploy/checklist-publicacao-lojas.md). Ícone, splash e ícone adaptativo: assets/ (gerados de docs/design/assets).
 */
const config: ExpoConfig = {
  name: 'Webag',
  slug: 'webag',
  scheme: 'webag',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  // 1024x1024 sem transparência (exigência da App Store; a Play usa o ícone adaptativo abaixo).
  icon: './assets/icon.png',
  // Preenchido pelo `eas init` (id do projeto no Expo, não é segredo). Também aceito por variável: EAS_PROJECT_ID.
  extra: process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {},
  ios: {
    bundleIdentifier: 'br.com.webag.app',
    supportsTablet: false,
    // O app só usa criptografia padrão (HTTPS): evita a pergunta de conformidade de exportação a cada envio à App Store.
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    // Edge-to-edge é obrigatório no SDK atual: telas usam safe areas.
    package: 'br.com.webag.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#00696F' },
    // SEC-012 / MASVS-STORAGE (revisão Onda 1, SEC-120): sem backup automático no Google Drive. Endereços (AsyncStorage) e o
    // id do aparelho não saem do aparelho; o SecureStore restaurado em outro aparelho não decifra e só geraria erro.
    allowBackup: false,
    // Só localização aproximada, só durante o uso (SEC-084, minimização). Revisar se o MapPinPicker exigir ponto preciso.
    blockedPermissions: [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
    ],
  },
  plugins: [
    'expo-router',
    'expo-font',
    // Splash (identidade.md): fundo brand.600, símbolo branco de 96 px centralizado.
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 96, backgroundColor: '#00696F' },
    ],
    'expo-secure-store',
    [
      'expo-location',
      {
        // Texto do diálogo do sistema. O app explica o motivo ANTES, em tela própria (design-system.md §5.6).
        locationWhenInUsePermission:
          'O Webag usa sua localização só enquanto o app está aberto, para mostrar as lojas que entregam perto de você.',
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
  ],
  experiments: { typedRoutes: true },
};

export default config;
