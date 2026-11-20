'use client';

import { Copy, DownloadSimple, Printer } from '@phosphor-icons/react';
import { Banner, Button, cx, ui, useToast } from '@/components/ui';
import { tid } from '@/lib/testid';

/** Mostra os códigos de recuperação UMA vez (copiar, baixar, imprimir). Não guarda nada em armazenamento do navegador. */
export function RecoveryCodes({ codes, screen }: { codes: string[]; screen: string }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      toast.show('Copiado');
    } catch {
      toast.show('Não foi possível copiar. Selecione o texto e copie.');
    }
  }
  function download() {
    const blob = new Blob([`Códigos de recuperação do Webag Admin\nCada código vale uma vez.\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'webag-admin-codigos-de-recuperacao.txt';
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className={ui.stack}>
      <Banner tone="warning">Esses códigos aparecem só agora. Cada um vale uma vez. Use um se perder o celular.</Banner>
      <ol aria-label="Códigos de recuperação" data-testid={tid(screen, 'recovery-list')} style={{ columns: 2, margin: 0, paddingLeft: 24 }}>
        {codes.map((code) => (
          <li key={code} className={cx('wb-text-body-strong', ui.mono)}>{code}</li>
        ))}
      </ol>
      <div className={ui.row} style={{ flexWrap: 'wrap' }}>
        <Button variant="secondary" size="sm" icon={<Copy size={20} aria-hidden="true" />} onClick={() => void copy()}>Copiar tudo</Button>
        <Button variant="secondary" size="sm" icon={<DownloadSimple size={20} aria-hidden="true" />} onClick={download}>Baixar arquivo</Button>
        <Button variant="secondary" size="sm" icon={<Printer size={20} aria-hidden="true" />} onClick={() => window.print()}>Imprimir</Button>
      </div>
    </div>
  );
}
