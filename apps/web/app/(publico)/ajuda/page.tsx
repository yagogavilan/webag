import type { Metadata } from 'next';
import Link from 'next/link';
import { Contacts } from '@/components/public/contacts';
import { Container } from '@/components/public/public-shell';
import s from '@/components/public/public.module.css';
import { renderInline } from '@/lib/markdown-lite';
import { loadHelp } from '@/server/public-content';

export const metadata: Metadata = {
  title: 'Ajuda',
  description: 'Perguntas frequentes sobre pedidos, pagamento, trocas e conta no Webag, e como falar com a gente.',
  alternates: { canonical: '/ajuda' },
};

/** Resposta do FAQ: texto simples do admin; parágrafos por linha em branco, sem HTML (nunca interpretado). */
function Answer({ text }: { text: string }) {
  return (
    <>
      {text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((paragraph, i) => (
        <p key={i}>{renderInline(paragraph.trim())}</p>
      ))}
    </>
  );
}

export default async function Page() {
  const loaded = await loadHelp('customer');
  const groups = loaded.status === 'ok' ? loaded.data.groups.filter((g) => g.items.length > 0) : [];
  return (
    <Container>
      <h1 className={`wb-text-display ${s.title}`}>Ajuda</h1>
      {loaded.status !== 'ok' ? (
        <div className={s.notice} role="status" data-testid="public.ajuda.unavailable">
          <p className="wb-text-body">Não conseguimos carregar as perguntas agora. Atualize a página em instantes ou fale com a gente em <Link href="/suporte">Suporte</Link>.</p>
        </div>
      ) : null}
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`g-${group.id}`} data-testid={`public.ajuda.group-${group.id}`}>
          <h2 id={`g-${group.id}`} className="wb-text-title2" style={{ margin: '0 0 var(--wb-space-3)' }}>{group.label}</h2>
          {group.items.map((item) => (
            <details key={item.id} className={s.faq}>
              <summary>{item.question}</summary>
              <div className={s.faqBody}>
                <Answer text={item.answer} />
              </div>
            </details>
          ))}
        </section>
      ))}
      <section className={s.card} aria-labelledby="falar">
        <h2 id="falar" className="wb-text-title2">Não achou o que procurava?</h2>
        {loaded.status === 'ok' ? <Contacts contacts={loaded.data.contacts} /> : null}
        <p className="wb-text-body">Veja também a página de <Link href="/suporte">Suporte</Link>.</p>
      </section>
    </Container>
  );
}
