import type { HelpData } from '@/server/public-content';
import s from './public.module.css';

const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/** Canais de atendimento vindos da configuração do admin. Só monta link de WhatsApp com dígitos e de e-mail com formato válido. */
export function Contacts({ contacts }: { contacts: HelpData['contacts'] }) {
  const digits = contacts.whatsapp?.replace(/\D/g, '') ?? '';
  const whatsapp = digits.length >= 10 && digits.length <= 15 ? digits : null;
  const email = contacts.email && EMAIL.test(contacts.email) ? contacts.email : null;
  if (!whatsapp && !email && !contacts.hours) return null;
  return (
    <ul className={s.contactList} data-testid="public.contatos">
      {whatsapp ? (
        <li>
          WhatsApp: <a href={`https://wa.me/${whatsapp}`} rel="noopener noreferrer">{formatPhone(whatsapp)}</a>
        </li>
      ) : null}
      {email ? (
        <li>
          E-mail: <a href={`mailto:${email}`}>{email}</a>
        </li>
      ) : null}
      {contacts.hours ? <li>Atendimento: {contacts.hours}</li> : null}
    </ul>
  );
}

function formatPhone(digits: string): string {
  const national = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (national.length === 11) return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  if (national.length === 10) return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  return digits;
}
