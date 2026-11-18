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
  },
  plugins: ['expo-router', 'expo-font', 'expo-splash-screen'],
  experiments: { typedRoutes: true },
};

export default config;
