import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExpoConfig } from 'expo/config';

/** Cor de marca lida do tema ativo de packages/tokens (fonte única; ícone e splash usam a mesma). */
function readBrand(): string {
  const dir = join(__dirname, '..', '..', 'packages', 'tokens');
  const theme = (JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8')) as { $theme: string }).$theme;
  const file = JSON.parse(readFileSync(join(dir, 'theme', `${theme}.json`), 'utf8')) as {
    color: { brand: Record<string, string> };
  };
  return file.color.brand['500'] as string;
}
const BRAND = readBrand();

/**
 * Configuração do app. Tudo aqui é embutido no binário (público): nada de segredo.
 * Variáveis por ambiente: EXPO_PUBLIC_* (infra/env.example no dev; EAS Environment Variables nos builds, ver eas.json e
 * docs/deploy/checklist-publicacao-lojas.md). Ícone, splash e ícone adaptativo: assets/ (pnpm --filter @webag/mobile assets; símbolo v4a de docs/design/logo).
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
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-monochrome.png',
      backgroundColor: BRAND,
    },
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
    // Splash (identidade v2): fundo na cor de marca, símbolo v4a branco (~115 px) centralizado.
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 240, backgroundColor: BRAND },
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
