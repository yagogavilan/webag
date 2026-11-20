import type { Metadata } from 'next';
import Link from 'next/link';
import { Contacts } from '@/components/public/contacts';
import { Container } from '@/components/public/public-shell';
import s from '@/components/public/public.module.css';
import { loadHelp } from '@/server/public-content';

export const metadata: Metadata = {
  title: 'Suporte',
  description: 'Fale com o suporte do Webag: canais de atendimento, horários e atalhos para os problemas mais comuns.',
  alternates: { canonical: '/suporte' },
};

export default async function Page() {
  const loaded = await loadHelp('customer');
  return (
    <Container>
      <h1 className={`wb-text-display ${s.title}`}>Suporte</h1>
      <p className="wb-text-body" style={{ margin: 0 }}>Para problemas com um pedido, o caminho mais rápido é abrir o pedido no app e tocar em Ajuda: assim já sabemos de qual compra se trata.</p>
      <section className={s.card} aria-labelledby="canais" data-testid="public.suporte.canais">
        <h2 id="canais" className="wb-text-title2">Canais de atendimento</h2>
        {loaded.status === 'ok' ? <Contacts contacts={loaded.data.contacts} /> : <p className="wb-text-body">Não conseguimos carregar os canais agora. Atualize a página em instantes.</p>}
        <p className={`wb-text-caption ${s.meta}`}>Não envie senha nem dados de cartão por nenhum canal.</p>
      </section>
      <section className={s.card} aria-labelledby="atalhos">
        <h2 id="atalhos" className="wb-text-title2">Atalhos</h2>
        <ul className={s.contactList}>
          <li><Link href="/ajuda">Perguntas frequentes</Link></li>
          <li><Link href="/excluir-conta">Excluir a minha conta</Link></li>
          <li><Link href="/privacidade">Privacidade e canal do encarregado de dados</Link></li>
        </ul>
      </section>
    </Container>
  );
}
