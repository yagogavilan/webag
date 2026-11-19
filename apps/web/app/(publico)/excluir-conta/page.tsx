import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/public/public-shell';
import s from '@/components/public/public.module.css';
import { AccountDeletionFlow } from '@/features/public/account-deletion-flow';
import { CancelDeletionPublic } from '@/features/public/cancel-deletion-public';
import { PrivacyRequestForm } from '@/features/public/privacy-request-form';
import { hoursText } from '@/features/account/legal-copy';
import { deletionFacts } from '@/lib/public-deletion';
import { loadHelp } from '@/server/public-content';

export const metadata: Metadata = {
  title: 'Excluir conta',
  description: 'Como excluir a sua conta Webag e os seus dados pessoais, mesmo sem o app, o que é apagado e o que a lei nos obriga a guardar.',
  alternates: { canonical: '/excluir-conta' },
};

/**
 * Página pública de exclusão (WB-214), URL citada na Data Safety do Google Play e na política. Os prazos vêm de `deletionFacts()` (um
 * só lugar, SEC-178). Texto sujeito a revisão jurídica (J1-J14).
 */
export default async function Page() {
  const help = await loadHelp('customer');
  const privacy = help.status === 'ok' ? help.data.privacy : null;
  const F = deletionFacts();
  return (
    <Container>
      <h1 className={`wb-text-display ${s.title}`}>Excluir conta Webag</h1>
      <div className={s.prose}>
        <p>Você pode excluir a sua conta e os seus dados pessoais quando quiser, com ou sem o app instalado. Esta página explica como fazer, o que acontece depois e o que precisamos guardar por obrigação legal.</p>

        <h2>Se você ainda entra no app</h2>
        <ol>
          <li>Abra o app Webag e entre na sua conta.</li>
          <li>Toque em Conta, depois em Privacidade e dados, depois em Excluir minha conta.</li>
          <li>Leia o resumo e confirme com a sua senha.</li>
        </ol>
        <p>Se não tem mais o app, use o formulário logo abaixo: não é preciso reinstalar nada. Se houver pedido ou troca em andamento, mostramos quais são. Conclua antes de excluir. Quem é dono de loja encerra a loja junto com a conta.</p>
      </div>

      <section className={s.card} aria-labelledby="sem-app" data-testid="public.excluir.web">
        <h2 id="sem-app" className="wb-text-title2">Excluir sem o app</h2>
        <AccountDeletionFlow />
      </section>

      <div className={s.prose}>
        <h2>O que acontece depois</h2>
        <ul>
          <li>A conta fecha na hora. Você sai de todos os aparelhos e não consegue mais usar o app com ela.</li>
          <li>
            Você tem {hoursText(F.regretHours)} para desistir. Nesse prazo, use o formulário &ldquo;Mudou de ideia?&rdquo; mais abaixo, ou entre de novo no app com o e-mail e a senha. Passado o prazo, a exclusão não pode ser desfeita.
          </li>
          <li>Terminado o prazo, apagamos ou anonimizamos os seus dados pessoais, como descrito abaixo. Você recebe um e-mail avisando.</li>
        </ul>

        <h2>O que é apagado</h2>
        <ul>
          <li>Nome, e-mail, celular e endereços salvos.</li>
          <li>Fotos que você enviou, como as de uma troca.</li>
          <li>Histórico de busca, favoritos e sacola.</li>
          <li>Avaliações e denúncias deixam de ter ligação com você.</li>
          <li>Aparelhos conectados e preferências de aviso.</li>
        </ul>

        <h2>O que a lei nos obriga a guardar</h2>
        <ul>
          <li>Pedidos, valores e dados de pagamento, sem identificação direta, por {F.fiscalRetentionYears} anos (obrigação fiscal e contábil).</li>
          <li>Registros de acesso, como IP e data, por {F.accessLogMonths} meses (Marco Civil da Internet, art. 15).</li>
          <li>O registro de que você aceitou os termos, com o IP parcialmente ocultado, para provar o consentimento.</li>
        </ul>
        <p>
          Os detalhes estão na <Link href="/privacidade">Política de privacidade</Link>.
        </p>
      </div>

      <section className={s.card} aria-labelledby="desistir" data-testid="public.excluir.cancel">
        <h2 id="desistir" className="wb-text-title2">Mudou de ideia?</h2>
        <p className="wb-text-body">
          Se você pediu a exclusão há menos de {hoursText(F.regretHours)}, entre com o e-mail e a senha para desistir e reativar a conta.
        </p>
        <CancelDeletionPublic />
      </section>

      <section className={s.card} aria-labelledby="encarregado" data-testid="public.excluir.request">
        <h2 id="encarregado" className="wb-text-title2">Não consegue receber o e-mail ou entrar?</h2>
        <p className="wb-text-body">
          Peça pelo canal do encarregado de dados. Por segurança, podemos pedir informações para confirmar que a conta é sua antes de excluir. Respondemos em até {F.privacyAnswerDays} dias.
        </p>
        <PrivacyRequestForm officerEmail={privacy?.officerEmail ?? null} />
        {privacy?.officerName || privacy?.officerEmail ? (
          <p className={`wb-text-caption ${s.meta}`}>
            Encarregado: {privacy.officerName ?? 'Webag'}
            {privacy.officerEmail ? <>. <a href={`mailto:${privacy.officerEmail}`}>{privacy.officerEmail}</a></> : null}
          </p>
        ) : null}
      </section>
    </Container>
  );
}
