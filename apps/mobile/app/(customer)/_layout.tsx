import { Stack } from 'expo-router';

/** Área do cliente. O grupo (auth) entra com as histórias de cadastro/login (ADR-003). */
export default function CustomerLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
