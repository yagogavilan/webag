import * as SecureStore from 'expo-secure-store';

/** Chave-valor no SecureStore (Keychain/Keystore). Para o que não pode ficar em AsyncStorage. */
export async function readSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}
export async function writeSecure(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // sem Keystore: não guarda
  }
}
export async function deleteSecure(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignora
  }
}
