'use client';

import { ArrowDown, ArrowUp, PencilSimple, Question, Trash } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Banner, Button, Dialog, EmptyState, NoAccessState, QueryBoundary, SelectField, Switch, TabPanel, Tabs, TextArea, TextField, cx, ui, useToast } from '@/components/ui';
import k from '@/components/panel/kit.module.css';
import { FAQ_GROUPS, contentApi, contentKeys, type HelpFaq } from '@/lib/api/admin-content';
import { saveErrorMessage } from '@/lib/api/messages';
import { tid } from '@/lib/testid';

const T = (id: string) => tid('ajuda', id);
type Tab = 'customer' | 'merchant' | 'contacts';

/** Máscara de WhatsApp com DDD: "(11) 91234-5678". Só os dígitos vão à API. */
export function maskPhone(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const validMail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** AJ3: conteúdo da ajuda (perguntas e contatos) sem deploy. Operação e super admin editam. */
export function HelpAdminPage() {
  const { canView, canEdit } = useSession();
  const [tab, setTab] = useState<Tab>('customer');
  if (!canView('ajuda')) return <NoAccessState />;
  return (
    <div className={k.page}>
      <PageHeader title="Ajuda" description="Atualize as perguntas e os contatos que o app e o painel do lojista mostram." />
      <Tabs label="Conteúdo da ajuda" value={tab} onChange={setTab} tabs={[{ id: 'customer', label: 'Perguntas do cliente', testId: T('tab-customer') }, { id: 'merchant', label: 'Perguntas do lojista', testId: T('tab-merchant') }, { id: 'contacts', label: 'Contatos', testId: T('tab-contacts') }]} />
      <TabPanel id={tab}>{tab === 'contacts' ? <Contacts editable={canEdit('ajuda')} /> : <Faqs audience={tab} editable={canEdit('ajuda')} />}</TabPanel>
    </div>
  );
}

function Faqs({ audience, editable }: { audience: 'customer' | 'merchant'; editable: boolean }) {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: contentKeys.faqs, queryFn: contentApi.faqs });
  const [editing, setEditing] = useState<HelpFaq | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: contentKeys.faqs });
  const toggle = useMutation({ mutationFn: ({ id, published }: { id: string; published: boolean }) => contentApi.updateFaq(id, { published }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => contentApi.deleteFaq(id), onSuccess: refresh });
  const reorder = useMutation({ mutationFn: ({ group, ids }: { group: string; ids: string[] }) => contentApi.reorderFaqs(audience, group, ids), onSuccess: refresh });

  async function move(group: HelpFaq[], index: number, delta: -1 | 1) {
    const ids = group.map((f) => f.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setError(null);
    try {
      await reorder.mutateAsync({ group: group[0]!.group, ids });
    } catch (e) {
      setError(saveErrorMessage(e));
    }
  }

  return (
    <>
      <div className={k.row}>
        <span />
        {editable ? <Button onClick={() => setEditing('new')} data-testid={T('faq-new')}>Nova pergunta</Button> : null}
      </div>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <QueryBoundary query={query} skeletonLabel="Carregando perguntas" empty={(d) => (d.data.filter((f) => f.audience === audience).length === 0 ? <EmptyState icon={Question} title="Nenhuma pergunta ainda" text="Sem perguntas, a Ajuda mostra só o contato." actionLabel={editable ? 'Nova pergunta' : undefined} onAction={() => setEditing('new')} testId={T('empty')} /> : null)}>
        {(data) => {
          const mine = data.data.filter((f) => f.audience === audience);
          return (
            <>
              {FAQ_GROUPS[audience].map((g) => {
                const items = mine.filter((f) => f.group === g.id).sort((a, b) => a.position - b.position);
                if (items.length === 0) return null;
                return (
                  <section key={g.id} aria-labelledby={`g-${g.id}`}>
                    <h2 id={`g-${g.id}`} className="wb-text-title2" style={{ margin: '0 0 8px' }}>{g.label}</h2>
                    <ul className={k.list}>
                      {items.map((f, i) => (
                        <li key={f.id} className={k.card} data-testid={T(`faq-${f.id}`)}>
                          <div className={k.row}>
                            <span className="wb-text-body-strong">{f.question}</span>
                            {editable ? (
                              <span className={k.reorder}>
                                <button type="button" className={ui.iconButton} aria-label={`Subir ${f.question}`} disabled={i === 0 || reorder.isPending} onClick={() => void move(items, i, -1)} data-testid={T(`faq-${f.id}-up`)}><ArrowUp size={20} aria-hidden="true" /></button>
                                <button type="button" className={ui.iconButton} aria-label={`Descer ${f.question}`} disabled={i === items.length - 1 || reorder.isPending} onClick={() => void move(items, i, 1)} data-testid={T(`faq-${f.id}-down`)}><ArrowDown size={20} aria-hidden="true" /></button>
                                <button type="button" className={ui.iconButton} aria-label={`Editar ${f.question}`} onClick={() => setEditing(f)}><PencilSimple size={20} aria-hidden="true" /></button>
                                <button type="button" className={ui.iconButton} aria-label={`Excluir ${f.question}`} onClick={() => void remove.mutateAsync(f.id).then(() => toast.show('Pergunta excluída.'), (e) => setError(saveErrorMessage(e)))}><Trash size={20} aria-hidden="true" /></button>
                              </span>
                            ) : null}
                          </div>
                          <p className={cx('wb-text-body', k.muted)}>{f.answer}</p>
                          <Switch checked={f.published} onChange={() => void toggle.mutateAsync({ id: f.id, published: !f.published }).then(() => toast.show(f.published ? 'Pergunta despublicada.' : 'Pergunta publicada.'), (e) => setError(saveErrorMessage(e)))} label={`Publicada: ${f.question}`} onText="Publicada" offText="Rascunho" disabled={!editable} testId={T(`faq-${f.id}-switch`)} />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </>
          );
        }}
      </QueryBoundary>
      {editing ? <FaqForm audience={audience} faq={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function FaqForm({ audience, faq, onClose }: { audience: 'customer' | 'merchant'; faq: HelpFaq | null; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [group, setGroup] = useState(faq?.group ?? FAQ_GROUPS[audience][0]!.id);
  const [question, setQuestion] = useState(faq?.question ?? '');
  const [answer, setAnswer] = useState(faq?.answer ?? '');
  const [published, setPublished] = useState(faq?.published ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    const next: Record<string, string> = {};
    if (question.trim().length < 3) next.question = 'Escreva a pergunta.';
    if (answer.trim().length < 3) next.answer = 'Escreva a resposta.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFormError(null);
    try {
      if (faq) await contentApi.updateFaq(faq.id, { group, question: question.trim(), answer: answer.trim(), published });
      else await contentApi.createFaq({ audience, group, question: question.trim(), answer: answer.trim(), published });
      await client.invalidateQueries({ queryKey: contentKeys.faqs });
      toast.show('Pergunta salva.');
      onClose();
    } catch (e) {
      setFormError(saveErrorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Dialog title={faq ? 'Editar pergunta' : 'Nova pergunta'} onClose={onClose} locked={busy} testId={T('faq-form')} actions={<><Button loading={busy} loadingLabel="Salvando…" onClick={() => void save()} data-testid={T('submit')}>Salvar pergunta</Button><Button variant="text" onClick={onClose} disabled={busy}>Cancelar</Button></>}>
      <div className={k.form}>
        {formError ? <Banner tone="danger">{formError}</Banner> : null}
        <SelectField label="Grupo" value={group} onChange={(e) => setGroup(e.target.value)} data-testid={T('faq-group-select')}>{FAQ_GROUPS[audience].map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</SelectField>
        <TextField label="Pergunta" value={question} onChange={(e) => setQuestion(e.target.value.slice(0, 100))} counter={{ value: question.length, max: 100 }} error={errors.question} data-testid={T('faq-question-input')} />
        <TextArea label="Resposta" rows={5} value={answer} onChange={(e) => setAnswer(e.target.value.slice(0, 600))} counter={{ value: answer.length, max: 600 }} error={errors.answer} data-testid={T('faq-answer-input')} />
        <Switch checked={published} onChange={setPublished} label="Publicada" onText="Publicada" offText="Rascunho" />
      </div>
    </Dialog>
  );
}

function Contacts({ editable }: { editable: boolean }) {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: contentKeys.contacts, queryFn: contentApi.contacts });
  return (
    <QueryBoundary query={query} skeletonLabel="Carregando contatos">
      {(c) => <ContactsForm key={JSON.stringify(c)} initial={c} editable={editable} onSaved={async () => { await client.invalidateQueries({ queryKey: contentKeys.contacts }); toast.show('Contatos salvos.'); }} />}
    </QueryBoundary>
  );
}

function ContactsForm({ initial, editable, onSaved }: { initial: { supportWhatsapp: string | null; supportEmail: string | null; supportHours: string | null; privacyOfficerName: string | null; privacyOfficerEmail: string | null }; editable: boolean; onSaved: () => Promise<void> }) {
  const [whatsapp, setWhatsapp] = useState(maskPhone(initial.supportWhatsapp ?? ''));
  const [email, setEmail] = useState(initial.supportEmail ?? '');
  const [hours, setHours] = useState(initial.supportHours ?? '');
  const [dpoName, setDpoName] = useState(initial.privacyOfficerName ?? '');
  const [dpoMail, setDpoMail] = useState(initial.privacyOfficerEmail ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    const digits = whatsapp.replace(/\D/g, '');
    const next: Record<string, string> = {};
    if (digits && ![10, 11].includes(digits.length)) next.whatsapp = 'Confira o WhatsApp com DDD.';
    if (email && !validMail(email)) next.email = 'Confira o e-mail.';
    if (dpoMail && !validMail(dpoMail)) next.dpoMail = 'Confira o e-mail.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFormError(null);
    try {
      await contentApi.saveContacts({ supportWhatsapp: digits || null, supportEmail: email.trim() || null, supportHours: hours.trim() || null, privacyOfficerName: dpoName.trim() || null, privacyOfficerEmail: dpoMail.trim() || null });
      await onSaved();
    } catch (e) {
      setFormError(saveErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={k.form} style={{ maxWidth: 560 }} onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
      {formError ? <Banner tone="danger">{formError}</Banner> : null}
      <TextField label="WhatsApp do suporte" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(maskPhone(e.target.value))} error={errors.whatsapp} disabled={!editable} data-testid={T('whatsapp-input')} />
      <TextField label="E-mail do suporte" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} disabled={!editable} data-testid={T('mail-input')} />
      <TextField label="Horário de atendimento" value={hours} onChange={(e) => setHours(e.target.value.slice(0, 60))} counter={{ value: hours.length, max: 60 }} disabled={!editable} data-testid={T('hours-input')} />
      <TextField label="Nome do encarregado de dados" value={dpoName} onChange={(e) => setDpoName(e.target.value.slice(0, 80))} disabled={!editable} />
      <TextField label="E-mail do encarregado de dados" type="email" value={dpoMail} onChange={(e) => setDpoMail(e.target.value)} error={errors.dpoMail} disabled={!editable} data-testid={T('dpo-mail-input')} />
      {editable ? <Button type="submit" loading={busy} loadingLabel="Salvando…" data-testid={T('submit')}>Salvar contatos</Button> : null}
    </form>
  );
}
