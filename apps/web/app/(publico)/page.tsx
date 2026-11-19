import type { Metadata } from 'next';
import Link from 'next/link';
import s from '@/components/public/home.module.css';
import { storeLinks } from '@/server/config';

const DESCRIPTION = 'O Webag reúne lojas de produtos do dia a dia em um só aplicativo. Escolha, pague com PIX ou cartão e acompanhe o pedido até receber ou retirar.';

export const metadata: Metadata = {
  title: { absolute: 'Webag: compre de lojas parceiras pelo aplicativo' },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { title: 'Webag', description: DESCRIPTION, url: '/' },
};

function StoreButton({ href, label, placeholder, testId }: { href: string | null; label: string; placeholder: string; testId: string }) {
  if (href) {
    return (
      <a href={href} className={s.store} rel="noopener noreferrer" data-testid={testId}>
        {label}
      </a>
    );
  }
  // Antes da publicação não há link: o texto reservado marca o lugar e não é clicável.
  return (
    <span className={s.storePending} data-testid={testId}>
      {placeholder}
    </span>
  );
}

export default function Home() {
  const { play, apple } = storeLinks();
  return (
    <>
      <section className={s.hero} aria-labelledby="titulo">
        <div className={s.heroInner}>
          <h1 id="titulo" className={`wb-text-hero ${s.heroTitle}`}>Compre de lojas parceiras e receba em casa ou retire na loja.</h1>
          <p className={`wb-text-body ${s.heroText}`}>{DESCRIPTION}</p>
          <div className={s.stores} aria-label="Baixar o aplicativo">
            <StoreButton href={play} label="Baixar na Google Play" placeholder="[link da Google Play]" testId="public.home.play" />
            <StoreButton href={apple} label="Baixar na App Store" placeholder="[link da App Store]" testId="public.home.apple" />
          </div>
        </div>
      </section>

      <section className={s.section} aria-labelledby="como">
        <h2 id="como" className="wb-text-title1">Como funciona</h2>
        <ol className={s.steps}>
          <li>
            <strong>Escolha</strong>
            <span>Veja lojas e produtos, compare e monte a sua sacola.</span>
          </li>
          <li>
            <strong>Pague</strong>
            <span>PIX ou cartão, com o pagamento feito pelo Mercado Pago.</span>
          </li>
          <li>
            <strong>Acompanhe</strong>
            <span>Veja cada etapa do pedido no app e receba avisos.</span>
          </li>
        </ol>
      </section>

      <section className={s.section} aria-labelledby="mais">
        <h2 id="mais" className="wb-text-title1">Informações</h2>
        <ul className={s.links}>
          <li><Link href="/privacidade">Política de privacidade</Link></li>
          <li><Link href="/termos">Termos de uso</Link></li>
          <li><Link href="/ajuda">Ajuda e perguntas frequentes</Link></li>
          <li><Link href="/excluir-conta">Excluir conta</Link></li>
        </ul>
      </section>
    </>
  );
}
