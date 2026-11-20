import Link from 'next/link';
import s from './public.module.css';

export const LEGAL_LINKS = {
  customer: { href: '/termos', label: 'Termos de uso' },
  merchant: { href: '/termos/lojista', label: 'Termos do lojista' },
  privacy: { href: '/privacidade', label: 'Política de privacidade' },
  exchange: { href: '/termos/trocas', label: 'Política de trocas e reembolsos' },
} as const;

/** "Veja também" no fim de cada documento legal: os outros textos, alinhados à coluna de leitura (nunca centralizados). */
export function LegalLinks({ current }: { current: keyof typeof LEGAL_LINKS }) {
  const others = (Object.keys(LEGAL_LINKS) as (keyof typeof LEGAL_LINKS)[]).filter((key) => key !== current);
  return (
    <nav aria-label="Outros documentos" className={s.legalLinks} data-testid="public.legal-links">
      <p className="wb-text-caption">Veja também</p>
      <ul>
        {others.map((key) => (
          <li key={key}>
            <Link href={LEGAL_LINKS[key].href}>{LEGAL_LINKS[key].label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
