'use client';

import { Plus } from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { Button, ButtonLink } from '@/components/ui';
import { QUICK_MESSAGES } from '@/lib/catalog/quick';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import q from './quick.module.css';

/**
 * "Novo produto" (WB-370 C1, C8). Com internet é um link para `/lojista/produtos/novo`, que cria o rascunho e abre a câmera.
 * Sem internet o botão fica INERTE com o motivo escrito (`aria-disabled`, sem fila): ao tocar, mostra a mensagem e não envia nada.
 */
export function NewProductLink({ children = 'Novo produto', variant, className, testId = ltid('produtos', 'add') }: { children?: ReactNode; variant?: 'primary' | 'secondary' | 'text'; className?: string; testId?: string }) {
  const online = useOnline();
  const [tapped, setTapped] = useState(false);
  if (online) {
    return (
      <ButtonLink href={asRoute('/lojista/produtos/novo')} {...(variant ? { variant } : {})} icon={<Plus size={20} aria-hidden="true" />} {...(className ? { className } : {})} data-testid={testId}>
        {children}
      </ButtonLink>
    );
  }
  return (
    <>
      <Button {...(variant ? { variant } : {})} icon={<Plus size={20} aria-hidden="true" />} aria-disabled="true" className={[className, q.inert].filter(Boolean).join(' ')} onClick={() => setTapped(true)} data-testid={testId}>
        {children}
      </Button>
      {tapped ? (
        <p role="alert" className="wb-text-body" data-testid={`${testId}-offline`}>
          {QUICK_MESSAGES.offlineNew}
        </p>
      ) : null}
    </>
  );
}
