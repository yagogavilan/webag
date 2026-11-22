// Metro do app do cliente. Fora o padrão do Expo (monorepo, SVG etc.), só duas trocas de resolução que cortam peso do bundle
// (medidas em docs/qa/performance/app-2026-11-22.md). Metro não faz tree-shaking: o que um barrel importa entra inteiro e é executado no boot.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const ZOD_LOCALES_STUB = path.resolve(__dirname, 'src/lib/zod-locales-stub.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 1) `@webag/shared` completo traz ~600 KB de schemas Zod que só a API e o painel usam. O app usa a entrada `native` (sem `schemas`).
  if (moduleName === '@webag/shared') {
    return context.resolveRequest(context, '@webag/shared/native', platform);
  }
  // 2) O Zod exporta `locales` (48 idiomas, ~300 KB) pelo barrel. O app só usa o inglês padrão (carregado por import próprio) e nunca `z.locales`.
  if (/(^|\/)locales\/index\.js$/.test(moduleName) && /[\\/]node_modules[\\/](\.pnpm[\\/][^\\/]*[\\/]node_modules[\\/])?zod[\\/]/.test(context.originModulePath)) {
    return { type: 'sourceFile', filePath: ZOD_LOCALES_STUB };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
