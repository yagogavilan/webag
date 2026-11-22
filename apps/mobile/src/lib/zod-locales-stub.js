// Substitui `zod/v4/locales/index.js` no bundle do app (ver metro.config.js): o Zod só precisa do idioma padrão (inglês), que ele
// importa direto de `locales/en.js`. As mensagens que o usuário vê vêm dos schemas do app (pt-BR), não do Zod.
export {};
