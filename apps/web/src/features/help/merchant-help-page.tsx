'use client';

import { ChatCircleText, EnvelopeSimple, Question } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/panel/page-header';
import { Banner, EmptyState, QueryBoundary, SkeletonRows, ui } from '@/components/ui';
import { helpApi, helpKeys, type Help } from '@/lib/api/help';
import { supportHref } from '@/lib/lojista-access';
import { ltid } from '@/lib/testid';
import s from './help.module.css';

const T = (id: string) => ltid('ajuda', id);

/** WhatsApp só com dígitos (DDD + número); a API manda assim. Com ou sem o 55 na frente. */
export const whatsappLink = (digits: string | null): string | null => {
  const only = (digits ?? '').replace(/\D/g, '');
  if (only.length < 10) return null;
  return `https://wa.me/${only.startsWith('55') ? only : `55${only}`}`;
};

/** WB-034: ajuda do lojista. Perguntas e contatos vêm do texto que o admin edita; nada fixo no código. */
export function MerchantHelpPage() {
  const query = useQuery({ queryKey: helpKeys.merchant, queryFn: helpApi.merchant, staleTime: 60_000 });
  return (
    <div className={s.page}>
      <PageHeader title="Ajuda" description="Respostas rápidas e como falar com o Webag." />
      <QueryBoundary query={query} skeleton={<SkeletonRows rows={4} height={64} label="Carregando a ajuda" />}>
        {(help) => <HelpBody help={help} />}
      </QueryBoundary>
    </div>
  );
}

function HelpBody({ help }: { help: Help }) {
  const wa = whatsappLink(help.contacts.whatsapp) ?? (help.contacts.whatsapp === null && !help.contacts.email ? supportHref() : null);
  const hasContact = Boolean(wa || help.contacts.email);
  return (
    <>
      {hasContact ? (
        <section className={s.contact} aria-labelledby="help-contact" data-testid={T('contact')}>
          <h2 id="help-contact" className="wb-text-title2" style={{ margin: 0 }}>Falar com o Webag</h2>
          {help.contacts.hours ? <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('hours')}>{help.contacts.hours}</p> : null}
          <div className={s.contactActions}>
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={s.contactLink} data-testid={T('whatsapp')}>
                <ChatCircleText size={24} aria-hidden="true" />
                Chamar no WhatsApp
              </a>
            ) : null}
            {help.contacts.email ? (
              <a href={`mailto:${help.contacts.email}`} className={s.contactLink} data-testid={T('email')}>
                <EnvelopeSimple size={24} aria-hidden="true" />
                {help.contacts.email}
              </a>
            ) : null}
          </div>
        </section>
      ) : null}
      {help.groups.length === 0 ? (
        <EmptyState icon={Question} title="Ainda não há perguntas publicadas" text="Se precisar de ajuda agora, fale com o Webag pelos contatos acima." testId={T('empty')} />
      ) : (
        help.groups.map((group) => (
          <section key={group.id} aria-labelledby={`help-${group.id}`} className={ui.stack} data-testid={T(`group-${group.id}`)}>
            <h2 id={`help-${group.id}`} className="wb-text-title2" style={{ margin: 0 }}>{group.label}</h2>
            <div className={s.faqList}>
              {group.items.map((item) => (
                <details key={item.id} className={s.faq} data-testid={T(`faq-${item.id}`)}>
                  <summary className="wb-text-body-strong">{item.question}</summary>
                  <p className="wb-text-body" style={{ margin: 0, whiteSpace: 'pre-line' }}>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ))
      )}
      {help.privacy.officerName || help.privacy.officerEmail ? (
        <Banner tone="info" testId={T('privacy')}>
          Dúvidas sobre os seus dados pessoais: fale com {help.privacy.officerName ?? 'o encarregado de dados'}
          {help.privacy.officerEmail ? <> pelo e-mail <a href={`mailto:${help.privacy.officerEmail}`}>{help.privacy.officerEmail}</a></> : null}.
        </Banner>
      ) : null}
    </>
  );
}
