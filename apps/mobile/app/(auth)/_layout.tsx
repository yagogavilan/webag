import { Stack } from 'expo-router';
import { theme } from '../../src/theme';

/** Telas de acesso (cadastro, entrar, esqueci a senha, código). O visitante nunca é empurrado para cá: só por ação dele (onda-3 §0.6). */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.color.surface.background } }} />;
}
