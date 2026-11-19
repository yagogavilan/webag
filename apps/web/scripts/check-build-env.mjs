// Roda antes do `next build` da imagem de produção (Dockerfile). Variáveis NEXT_PUBLIC_* viram texto no JavaScript do navegador:
// uma URL http ou localhost embutida só se descobre depois de publicar (SEC-172). Falha o build em vez de publicar.
const problems = [];
for (const [name, raw] of Object.entries(process.env)) {
  if (!name.startsWith('NEXT_PUBLIC_') || !raw?.trim()) continue;
  const value = raw.trim();
  if (/URL$/.test(name)) {
    let ok = false;
    try {
      const url = new URL(value);
      ok = url.protocol === 'https:' && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url.hostname);
    } catch {
      ok = false;
    }
    if (!ok) problems.push(`${name}: precisa ser https e não pode apontar para localhost`);
  }
  if (name === 'NEXT_PUBLIC_SUPPORT_WHATSAPP' && !/^\d{10,15}$/.test(value)) problems.push(`${name}: só dígitos com DDI (10 a 15)`);
}
if (problems.length > 0) {
  console.error(`Build do web recusado (SEC-172):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('check-build-env: ok');
