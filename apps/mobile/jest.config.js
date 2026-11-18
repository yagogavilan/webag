const preset = require('jest-expo/jest-preset');

// phosphor-react-native e @tanstack/@hookform entregam fonte moderno/TS: o Jest precisa transformá-los (Metro já faz isso no app).
const [nodeModulesRule, ...otherRules] = preset.transformIgnorePatterns;

module.exports = {
  ...preset,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [nodeModulesRule.replace('native-base', 'native-base|phosphor-react-native'), ...otherRules],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/e2e/'],
};
