'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, LinkSimple, ListBullets, TextB, TextHTwo, TextHThree } from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type KeyboardEvent } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { ReasonDialog } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Banner, Button, NoAccessState, Switch, TextArea, TextField, cx, ui, useToast } from '@/components/ui';
import s from '@/components/panel/panel.module.css';
import { adminApi, keys } from '@/lib/api/admin';
import { formatClock, formatDay } from '@/lib/format';
import { MarkdownLite } from '@/lib/markdown-lite';
import { useOnline } from '@/lib/use-online';
import { tid } from '@/lib/testid';
import { effectiveIso, todayBrt, typeFromSlug } from './catalog';

const T = (id: string) => tid('termos', id);

type Edit = (selected: string) => { text: string; cursor?: 'inside' };
type Icon = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>;

/** Botões da barra: inserem a sintaxe e o texto continua legível (cada um tem rótulo de texto, AD5c). */
export const TOOLBAR: { id: string; label: string; icon: Icon; apply: Edit }[] = [
  { id: 'h2', label: 'Título', icon: TextHTwo, apply: (sel) => ({ text: `\n## ${sel || 'Título'}\n` }) },
  { id: 'h3', label: 'Subtítulo', icon: TextHThree, apply: (sel) => ({ text: `\n### ${sel || 'Subtítulo'}\n` }) },
  { id: 'bold', label: 'Negrito', icon: TextB, apply: (sel) => ({ text: `**${sel || 'texto'}**` }) },
  { id: 'list', label: 'Lista', icon: ListBullets, apply: (sel) => ({ text: `\n- ${sel || 'item'}\n` }) },
  { id: 'link', label: 'Link', icon: LinkSimple, apply: (sel) => ({ text: `[${sel || 'texto do link'}](https://)` }) },
];

interface Draft {
  content: string;
  date: string;
  relevant: boolean;
  savedAt: string;
}
const draftKey = (type: string) => `webag.admin.legal-draft.${type}`;

const noopSubscribe = () => () => undefined;

function readDraft(type: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(type));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null; // rascunho corrompido: começa do zero
  }
}

/** O rascunho mora no navegador: só monta o editor depois da hidratação para não divergir do HTML do servidor. */
export function EditorPage({ slug }: { slug: string }) {
  const client = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return client ? <Editor slug={slug} /> : null;
}

function Editor({ slug }: { slug: string }) {
  const { canEdit } = useSession();
  const meta = typeFromSlug(slug);
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const area = useRef<HTMLTextAreaElement>(null);
  const query = useQuery({ queryKey: keys.legal(meta?.type ?? 'privacy'), queryFn: () => adminApi.legalVersions(meta!.type), enabled: meta !== null });
  const [initial] = useState(() => (meta ? readDraft(meta.type) : null));
  const [content, setContent] = useState(initial?.content ?? '');
  const [date, setDate] = useState(initial?.date ?? '');
  const [relevant, setRelevant] = useState(initial?.relevant ?? false);
  const [errors, setErrors] = useState<{ content?: string; date?: string }>({});
  const [savedAt, setSavedAt] = useState<string | null>(initial?.savedAt ?? null);
  const [confirming, setConfirming] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!meta || (!content && !date)) return;
    const timer = window.setTimeout(() => {
      const now = new Date().toISOString();
      try {
        window.localStorage.setItem(draftKey(meta.type), JSON.stringify({ content, date, relevant, savedAt: now } satisfies Draft));
        setSavedAt(now);
      } catch {
        /* sem espaço: o texto continua na tela */
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [content, date, relevant, meta]);

  if (!meta || !canEdit('termos')) return <NoAccessState backHref="/admin/termos" />;

  const nextVersion = (query.data?.data.reduce((max, d) => Math.max(max, d.version), 0) ?? 0) + 1;

  function apply(edit: Edit) {
    const el = area.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? content.length;
    const inserted = edit(content.slice(start, end)).text;
    setContent(content.slice(0, start) + inserted + content.slice(end));
    window.setTimeout(() => el?.focus(), 0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      apply(TOOLBAR[2]!.apply);
    }
  }

  function askPublish() {
    const next = {
      content: content.trim().length < 20 ? 'Escreva o texto antes de publicar.' : undefined,
      date: !date ? 'Escolha a data de vigência.' : date < todayBrt() ? 'A vigência não pode ser no passado.' : undefined,
    };
    setErrors(next);
    if (!next.content && !next.date) setConfirming(true);
  }

  return (
    <>
      <Link href={`/admin/termos/${slug}` as never} className={cx('wb-text-body-strong', ui.row)} style={{ textDecoration: 'none' }}>
        <ArrowLeft size={20} aria-hidden="true" /> {meta.label}
      </Link>
      <PageHeader title={`Nova versão: ${meta.label}`} description={`Será a versão ${nextVersion}. Depois de publicada, não dá para editar.`} />
      {!online ? <Banner tone="warning" offline testId={T('offline')}>Sem conexão. Seu texto fica salvo neste aparelho até você publicar.</Banner> : null}
      <div className={s.editor}>
        <div className={ui.stack}>
          <div className={s.toolbar} role="toolbar" aria-label="Formatação do texto">
            {TOOLBAR.map(({ id, label, icon: Icon, apply: edit }) => (
              <Button key={id} variant="secondary" size="sm" icon={<Icon size={20} aria-hidden="true" />} onClick={() => apply(edit)} data-testid={T(`toolbar-${id}`)}>
                {label}
              </Button>
            ))}
          </div>
          <TextArea ref={area} label="Texto" hint="Use os botões para títulos, negrito, lista e link. HTML não é aceito: vira texto." value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={onKeyDown} error={errors.content} rows={16} data-testid={T('editor-text')} />
          <TextField label="Vigência a partir de" type="date" min={todayBrt()} value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} data-testid={T('effective-date')} />
          <div className={ui.stack}>
            <Switch checked={relevant} onChange={setRelevant} label="Mudança relevante" onText="Sim" offText="Não" testId={T('relevant-switch')} />
            <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>Todos os usuários precisam aceitar de novo no próximo uso.</p>
          </div>
          <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }} aria-live="polite" data-testid={T('draft-saved')}>
            {savedAt ? (online ? `Rascunho salvo às ${formatClock(savedAt)}` : 'Salvo neste aparelho') : 'O rascunho é salvo sozinho neste aparelho.'}
          </p>
          <div className={ui.row} style={{ flexWrap: 'wrap' }}>
            <Button onClick={askPublish} disabled={false} data-testid={T('publish')}>Publicar versão {nextVersion}</Button>
            <Button variant="secondary" className={s.onlyMobile} icon={<Eye size={20} aria-hidden="true" />} onClick={() => setPreviewOpen((v) => !v)} aria-expanded={previewOpen} data-testid={T('preview-toggle')}>
              {previewOpen ? 'Esconder prévia' : 'Pré-visualizar'}
            </Button>
          </div>
        </div>
        <div className={cx(s.previewCol, previewOpen && s.previewColOpen)} aria-hidden="true">
          <div className={s.previewBox} data-testid={T('preview')}>
            <div className={s.prose}>{content.trim() ? <MarkdownLite source={content} /> : <p className={ui.muted}>A prévia aparece aqui.</p>}</div>
          </div>
        </div>
      </div>
      {confirming ? (
        <ReasonDialog
          title={`Publicar a versão ${nextVersion} de ${meta.label}?`}
          description={`Vale a partir de ${date ? formatDay(effectiveIso(date)) : ''}. Não dá para editar depois; para corrigir, publique outra versão.${relevant ? ' Todos precisam aceitar de novo no próximo uso.' : ''}`}
          withReason={false}
          confirmLabel={`Publicar versão ${nextVersion}`}
          onConfirm={async () => {
            await adminApi.publishLegal(meta.type, { title: meta.label, content: content.trim(), effectiveAt: effectiveIso(date), relevantChange: relevant });
            window.localStorage.removeItem(draftKey(meta.type));
            await client.invalidateQueries({ queryKey: keys.legal(meta.type) });
            toast.show(`Versão ${nextVersion} publicada. Registrado na auditoria.`);
            router.push(`/admin/termos/${slug}` as never);
          }}
          onClose={() => setConfirming(false)}
          testIds={{ confirm: T('publish-confirm') }}
        />
      ) : null}
    </>
  );
}
