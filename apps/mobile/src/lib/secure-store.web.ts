/**
 * Navegador (DEC-058, só desenvolvimento e demonstração): o `expo-secure-store` não existe na web. Em vez de cair em
 * localStorage (legível por qualquer script da página), o segredo fica só na memória da aba: recarregar a página
 * sai da conta. O app de produção é o nativo; nada aqui afrouxa SEC-012.
 */
const memory = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return memory.get(key) ?? null;
}
export async function setItemAsync(key: string, value: string): Promise<void> {
  memory.set(key, value);
}
export async function deleteItemAsync(key: string): Promise<void> {
  memory.delete(key);
}
