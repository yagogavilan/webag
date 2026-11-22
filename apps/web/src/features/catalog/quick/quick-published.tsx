'use client';

import { CheckCircle, Copy } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';
import { Banner, Button, ButtonLink, SafeImage, cx, ui } from '@/components/ui';
import type { Product } from '@/lib/api/catalog';
import { pickImage } from '@/lib/catalog/helpers';
import { formatCents } from '@/lib/format';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { NewProductLink } from './new-product-link';
import { useDuplicate } from './use-duplicate';
import q from './quick.module.css';

const T = (id: string) => ltid('rapido', id);

/** Tela "Publicado" (WB-370 C3; spec §3 e §7): "Cadastrar outro" e "Duplicar este" lado a lado. */
export function QuickPublished({ storeId, product }: { storeId: string; product: Product }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { duplicate, busyId, error } = useDuplicate(storeId);
  useEffect(() => heading.current?.focus(), []);
  const inReview = product.moderationStatus === 'review';
  const cover = pickImage(product.images[0]?.urls, 160);

  return (
    <div className={q.done} data-testid={T('published')}>
      <span className={q.doneThumb}>
        <SafeImage src={cover} alt={`${product.name}: foto de capa`} width={120} height={120} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </span>
      <CheckCircle size={40} weight="fill" aria-hidden="true" color="var(--wb-color-text-success)" />
      <h2 ref={heading} tabIndex={-1} className="wb-text-title1" style={{ outline: 'none', margin: 0 }}>{inReview ? 'Enviado para análise' : 'Publicado'}</h2>
      <p className="wb-text-body-strong" style={{ margin: 0, overflowWrap: 'anywhere' }}>
        {product.name}
        {product.basePriceCents !== null ? ` · ${formatCents(product.basePriceCents)}` : ''}
      </p>
      <p className={cx('wb-text-body', ui.muted)} style={{ margin: 0 }}>
        {inReview ? 'Aparece na vitrine depois da aprovação.' : 'Já aparece na sua loja. Se a loja estiver fechada, aparece quando abrir.'}
      </p>
      <div className={q.doneActions}>
        <NewProductLink variant="primary" testId={T('another')}>Cadastrar outro</NewProductLink>
        <Button variant="secondary" icon={<Copy size={20} aria-hidden="true" />} loading={busyId === product.id} loadingLabel="Duplicando…" onClick={() => void duplicate(product.id)} data-testid={T('duplicate')}>
          Duplicar este
        </Button>
      </div>
      {error ? <Banner tone="danger" testId={T('duplicate-error')}>{error}</Banner> : null}
      <ButtonLink href={asRoute('/lojista/produtos')} variant="text" data-testid={T('see-products')}>Ver meus produtos</ButtonLink>
    </div>
  );
}
