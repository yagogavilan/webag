import type { Metadata } from 'next';
import { Container } from '@/components/public/public-shell';
import s from '@/components/public/public.module.css';
import { LICENSES } from '@/lib/licenses';

export const metadata: Metadata = {
  title: 'Licenças de código aberto',
  description: 'Créditos dos ícones, fontes e bibliotecas de código aberto usados pelo Webag.',
  alternates: { canonical: '/licencas' },
};

export default function Page() {
  return (
    <Container>
      <h1 className={`wb-text-display ${s.title}`}>Licenças de código aberto</h1>
      <p className="wb-text-body" style={{ margin: 0 }}>O Webag usa ícones, fontes e bibliotecas de código aberto. Agradecemos aos autores e listamos aqui os créditos e as licenças.</p>
      <ul className={s.contactList}>
        {LICENSES.map((item) => (
          <li key={item.id} className={s.card} data-testid={`public.licencas.${item.id}`}>
            <h2 className="wb-text-title2">{item.name}</h2>
            <p className="wb-text-body">{item.use}</p>
            <p className="wb-text-body">
              Autoria: {item.author}. Licença: <a href={item.licenseUrl} rel="noopener noreferrer">{item.license}</a>. <a href={item.sourceUrl} rel="noopener noreferrer">Origem</a>.
            </p>
            {item.note ? <p className={`wb-text-caption ${s.meta}`}>{item.note}</p> : null}
          </li>
        ))}
      </ul>
    </Container>
  );
}
