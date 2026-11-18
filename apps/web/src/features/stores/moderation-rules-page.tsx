'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Banner, Button, NoAccessState, QueryBoundary, SelectField, SkeletonRows, TextField, cx, ui, useToast } from '@/components/ui';
import { adminApi, keys } from '@/lib/api/admin';
import { moderationApi, moderationKeys } from '@/lib/api/admin-moderation';
import { saveErrorMessage } from '@/lib/api/messages';
import { asRoute } from '@/lib/routes';
import { tid } from '@/lib/testid';

const T = (id: string) => tid('moderacao', id);

/** Regras de moderação (A4): palavras e categorias que mandam produto novo para "Revisar". Nada é bloqueado sozinho. */
export function ModerationRulesPage() {
  const { user } = useSession();
  const toast = useToast();
  const client = useQueryClient();
  const act = user.adminProfile === 'super_admin' || user.adminProfile === 'operations';
  const [word, setWord] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rules = useQuery({ queryKey: moderationKeys.terms, queryFn: moderationApi.terms, enabled: act });
  const categories = useQuery({ queryKey: keys.categories, queryFn: adminApi.categories, enabled: act });
  if (!act) return <NoAccessState />;

  async function run(action: () => Promise<unknown>, message: string) {
    setError(null);
    try {
      await action();
      await client.invalidateQueries({ queryKey: moderationKeys.terms });
      toast.show(message);
    } catch (caught) {
      setError(saveErrorMessage(caught));
    }
  }

  async function addWord(event: FormEvent) {
    event.preventDefault();
    const value = word.trim();
    if (value.length < 2) return setError('Escreva a palavra (mínimo 2 letras).');
    if (/\s/.test(value)) return setError('Escreva uma palavra só. Para várias, adicione uma de cada vez.');
    await run(() => moderationApi.addTerm('suspect_word', value), 'Palavra adicionada.');
    setWord('');
  }

  const options = (categories.data?.data ?? []).flatMap((node) => [node, ...node.children]);

  return (
    <div className={ui.stack}>
      <PageHeader title="Regras de moderação" description="Produtos novos que combinarem entram em Revisar. Nada é bloqueado sozinho." action={<Link href={asRoute('/admin/moderacao')}>Voltar à moderação</Link>} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <QueryBoundary query={rules} skeleton={<SkeletonRows rows={3} height={56} label="Carregando as regras" />}>
        {(response) => {
          const words = response.data.filter((term) => term.kind === 'suspect_word');
          const forbidden = response.data.filter((term) => term.kind === 'forbidden_category');
          return (
          <>
            <section className={ui.card} aria-labelledby="palavras">
              <div className={ui.stack}>
                <h2 id="palavras" className="wb-text-title2" style={{ margin: 0 }}>Palavras proibidas</h2>
                <form onSubmit={(event) => void addWord(event)} className={ui.row} style={{ alignItems: 'flex-end' }}>
                  <TextField label="Nova palavra" value={word} onChange={(event) => setWord(event.target.value)} autoComplete="off" data-testid={T('rule-word-input')} />
                  <Button type="submit" data-testid={T('rule-word-add')}>Adicionar</Button>
                </form>
                <ul className={ui.row} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {words.map((item) => (
                    <li key={item.id}>
                      <span className={cx(ui.chip, 'wb-text-body')}>
                        {item.label ?? item.value}
                        <button type="button" className={ui.iconButton} aria-label={`Remover a palavra ${item.label ?? item.value}`} onClick={() => void run(() => moderationApi.removeTerm(item.id), 'Palavra removida.')} data-testid={T(`rule-word-${item.id}-remove`)}>
                          x
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
            <section className={ui.card} aria-labelledby="categorias">
              <div className={ui.stack}>
                <h2 id="categorias" className="wb-text-title2" style={{ margin: 0 }}>Categorias proibidas</h2>
                <div className={ui.row} style={{ alignItems: 'flex-end' }}>
                  <SelectField label="Categoria" value={category} onChange={(event) => setCategory(event.target.value)}>
                    <option value="">Escolha</option>
                    {options.map((node) => (
                      <option key={node.id} value={node.id}>{node.name}</option>
                    ))}
                  </SelectField>
                  <Button variant="secondary" disabled={!category} onClick={() => void run(() => moderationApi.addTerm('forbidden_category', category), 'Categoria adicionada.')} data-testid={T('rule-category-add')}>Adicionar</Button>
                </div>
                <ul className={ui.row} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {forbidden.map((item) => (
                    <li key={item.id}>
                      <span className={cx(ui.chip, 'wb-text-body')}>
                        {item.label ?? item.value}
                        <button type="button" className={ui.iconButton} aria-label={`Remover a categoria ${item.label ?? item.value}`} onClick={() => void run(() => moderationApi.removeTerm(item.id), 'Categoria removida.')}>x</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
