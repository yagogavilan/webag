import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/logo';
import { companyIdentity } from '@/lib/company';
import s from './public.module.css';

/** Páginas que o rodapé lista (as mesmas que as lojas pedem como URL pública). */
export const FOOTER_LINKS = [
  { href: '/privacidade', label: 'Política de privacidade' },
  { href: '/termos', label: 'Termos de uso' },
  { href: '/ajuda', label: 'Ajuda' },
  { href: '/suporte', label: 'Suporte' },
  { href: '/excluir-conta', label: 'Excluir conta' },
  { href: '/licencas', label: 'Licenças' },
] as const;

/**
 * Casca das páginas públicas: sem login, sem JavaScript próprio (componente de servidor). Um link para pular ao conteúdo,
 * logo oficial no topo e o mesmo rodapé em todas as páginas.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  const company = companyIdentity();
  return (
    <div className={s.page}>
      <a href="#conteudo" className={s.skip}>Ir para o conteúdo</a>
      <header className={s.header}>
        <Link href="/" aria-label="Webag, página inicial" className={s.brand}>
          <Logo size={28} />
        </Link>
      </header>
      <main id="conteudo" className={s.mainWide}>{children}</main>
      <footer className={s.footer}>
        <nav aria-label="Informações do Webag">
          <ul className={s.footerLinks}>
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className={`wb-text-caption ${s.copy}`} data-testid="public.footer.company">
          {company ? `${company.legalName} · CNPJ ${company.cnpj}` : 'Webag'}. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}

/** Coluna de leitura (720 px) das páginas de texto. */
export function Container({ children }: { children: ReactNode }) {
  return <div className={s.main}>{children}</div>;
}
