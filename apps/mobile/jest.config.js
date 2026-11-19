const preset = require('jest-expo/jest-preset');

// phosphor-react-native e @tanstack/@hookform entregam fonte moderno/TS: o Jest precisa transformá-los (Metro já faz isso no app).
const [nodeModulesRule, ...otherRules] = preset.transformIgnorePatterns;

module.exports = {
  ...preset,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [nodeModulesRule.replace('native-base', 'native-base'), ...otherRules],
  // Reanimated/worklets rodam em JS puro nos testes (resolvem a versão sem módulo nativo).
  resolver: require.resolve('react-native-reanimated/jest/resolver'),
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/e2e/'],
};
