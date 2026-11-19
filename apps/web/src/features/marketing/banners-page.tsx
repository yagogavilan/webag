'use client';

import { ArrowDown, ArrowUp, CheckCircle, Clock, Image as ImageIcon, PencilSimple, Prohibit, Trash, WarningCircle } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Badge, Banner, Button, Dialog, EmptyState, NoAccessState, QueryBoundary, SelectField, Switch, TabPanel, Tabs, TextField, cx, ui, useToast } from '@/components/ui';
import k from '@/components/panel/kit.module.css';
import { ImageCropper } from '@/features/lojista/image-cropper';
import { adminApi, keys, type City } from '@/lib/api/admin';
import { adminStoresApi } from '@/lib/api/admin-stores';
import { marketingApi, marketingKeys, type AdminBanner, type CreateBannerRequest, type Highlight } from '@/lib/api/admin-marketing';
import { saveErrorMessage } from '@/lib/api/messages';
import { formatDateTime, formatPct, fromLocalInput, toLocalInput } from '@/lib/format';
import { tid } from '@/lib/testid';

const T = (id: string) => tid('banners', id);
type DestType = CreateBannerRequest['destinationType'];
const DEST_LABEL: Record<DestType, string> = { store: 'Loja', category: 'Categoria', product: 'Produto', coupon: 'Cupom', none: 'Sem destino' };
const smallest = (urls: Record<string, string>): string | null => Object.keys(urls).sort((a, b) => Number(a) - Number(b)).map((w) => urls[w]).find(Boolean) ?? null;

export type BannerStatus = 'inactive' | 'scheduled' | 'live' | 'ended' | 'unavailable';
/** Status em ícone e texto (MK1). `live` vem da API; "destino indisponível" é janela aberta e ativo, mas fora do ar. */
export function bannerStatus(b: Pick<AdminBanner, 'active' | 'live' | 'startsAt' | 'endsAt'>, now = Date.now()): BannerStatus {
  if (Date.parse(b.endsAt) <= now) return 'ended';
  if (!b.active) return 'inactive';
  if (Date.parse(b.startsAt) > now) return 'scheduled';
  return b.live ? 'live' : 'unavailable';
}
const STATUS: Record<BannerStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info'; Icon: typeof Clock }> = {
  inactive: { label: 'Pausado', tone: 'neutral', Icon: Prohibit },
  scheduled: { label: 'Agendado', tone: 'info', Icon: Clock },
  live: { label: 'No ar', tone: 'success', Icon: CheckCircle },
  ended: { label: 'Encerrado', tone: 'neutral', Icon: Prohibit },
  unavailable: { label: 'Destino indisponível', tone: 'danger', Icon: WarningCircle },
};
export function StatusBadge({ status, testId }: { status: BannerStatus; testId?: string }) {
  const { label, tone, Icon } = STATUS[status];
  return (
    <Badge tone={tone} icon={<Icon size={16} weight="fill" aria-hidden="true" />} testId={testId}>
      {label}
    </Badge>
  );
}

export function BannersPage() {
  const { canView, canEdit } = useSession();
  const [tab, setTab] = useState<'banners' | 'highlights'>('banners');
  const [editing, setEditing] = useState<AdminBanner | 'new' | null>(null);
  const [addingHighlight, setAddingHighlight] = useState(false);
  const cities = useQuery({ queryKey: keys.cities, queryFn: adminApi.cities, enabled: canView('banners') });
  if (!canView('banners')) return <NoAccessState />;
  const editable = canEdit('banners');
  return (
    <div className={k.page}>
      <PageHeader
        title="Banners e destaques"
        description="Promova lojas, produtos e cupons na Início do app, sem publicar uma versão."
        action={
          editable ? (
            tab === 'banners' ? (
              <Button onClick={() => setEditing('new')} data-testid={T('new-banner')}>Novo banner</Button>
            ) : (
              <Button onClick={() => setAddingHighlight(true)} data-testid={T('highlight-add')}>Adicionar destaque</Button>
            )
          ) : null
        }
      />
      <Tabs label="Banners e destaques" value={tab} onChange={setTab} tabs={[{ id: 'banners', label: 'Banners', testId: T('tab-banners') }, { id: 'highlights', label: 'Destaques', testId: T('tab-highlights') }]} />
      <TabPanel id={tab}>{tab === 'banners' ? <BannerList cities={cities.data?.data ?? []} editable={editable} onEdit={setEditing} onNew={() => setEditing('new')} /> : <HighlightList cities={cities.data?.data ?? []} editable={editable} />}</TabPanel>
      {editing ? <BannerForm banner={editing === 'new' ? null : editing} cities={cities.data?.data ?? []} onClose={() => setEditing(null)} /> : null}
      {addingHighlight ? <HighlightForm cities={cities.data?.data ?? []} onClose={() => setAddingHighlight(false)} /> : null}
    </div>
  );
}

const cityName = (cities: City[], id: string | null) => (id ? (cities.find((c) => c.id === id)?.name ?? 'Cidade') : 'Todas as cidades');

function BannerList({ cities, editable, onEdit, onNew }: { cities: City[]; editable: boolean; onEdit: (b: AdminBanner) => void; onNew: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: marketingKeys.banners, queryFn: marketingApi.banners });
  const [deleting, setDeleting] = useState<AdminBanner | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof marketingApi.updateBanner>[1] }) => marketingApi.updateBanner(id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: marketingKeys.banners }),
  });
  const remove = useMutation({ mutationFn: (id: string) => marketingApi.deleteBanner(id), onSuccess: () => client.invalidateQueries({ queryKey: marketingKeys.banners }) });

  async function toggle(b: AdminBanner) {
    setRowError(null);
    try {
      await patch.mutateAsync({ id: b.id, body: { active: !b.active } });
      toast.show(b.active ? 'Banner pausado.' : 'Banner ativado.');
    } catch (error) {
      setRowError(saveErrorMessage(error));
    }
  }
  async function move(list: AdminBanner[], index: number, delta: -1 | 1) {
    const other = list[index + delta];
    const me = list[index];
    if (!other || !me) return;
    setRowError(null);
    try {
      await patch.mutateAsync({ id: me.id, body: { position: other.position } });
      await patch.mutateAsync({ id: other.id, body: { position: me.position } });
    } catch (error) {
      setRowError(saveErrorMessage(error));
    }
  }

  return (
    <QueryBoundary query={query} skeletonLabel="Carregando banners" empty={(data) => (data.data.length === 0 ? <EmptyState icon={ImageIcon} title="Nenhum banner" text="Banners aparecem no topo da Início do app." actionLabel={editable ? 'Novo banner' : undefined} onAction={onNew} testId={T('empty')} /> : null)}>
      {(data) => {
        const sorted = [...data.data].sort((a, b) => a.position - b.position);
        const anyLive = sorted.some((b) => bannerStatus(b) === 'live');
        return (
          <>
            {!anyLive ? <Banner tone="warning" testId={T('none-live')}>Nenhum banner no ar agora. O app oculta o bloco de banners.</Banner> : null}
            {rowError ? <Banner tone="danger" testId={T('row-error')}>{rowError}</Banner> : null}
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <caption className="wb-text-caption">Banners, na ordem em que aparecem</caption>
                <thead>
                  <tr>
                    <th>Banner</th><th>Destino</th><th>Cidades</th><th>Período</th><th>Status</th><th>Impressões e cliques</th>
                    {editable ? <th>Ativo</th> : null}
                    {editable ? <th>Ações</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((b, index) => {
                    const status = bannerStatus(b);
                    const thumb = smallest(b.image.urls);
                    return (
                      <tr key={b.id} data-testid={T(`row-${b.id}`)}>
                        <td data-primary>
                          <span className={k.start}>
                            {thumb ? /* eslint-disable-next-line @next/next/no-img-element -- imagem pública do banner */ <img className={k.thumb} src={thumb} alt="" /> : <span className={k.thumb} aria-hidden="true" />}
                            <span className="wb-text-body-strong">{b.title}</span>
                          </span>
                        </td>
                        <td data-label="Destino">{DEST_LABEL[b.destination.type]}{b.destination.code ? ` (${b.destination.code})` : ''}</td>
                        <td data-label="Cidades">{cityName(cities, b.cityId)}</td>
                        <td data-label="Período">{formatDateTime(b.startsAt)} a {formatDateTime(b.endsAt)}</td>
                        <td data-label="Status"><StatusBadge status={status} testId={T(`row-${b.id}-status`)} /></td>
                        <td data-label="Resultado" className={ui.mono}>{b.impressions ?? 0} impressões · {b.clicks ?? 0} cliques · taxa {formatPct(b.ctrPct)}</td>
                        {editable ? (
                          <td data-label="Ativo">
                            <Switch checked={b.active} onChange={() => void toggle(b)} label={`Banner ${b.title}`} onText="Ativo" offText="Pausado" busy={patch.isPending} testId={T(`row-${b.id}-switch`)} />
                          </td>
                        ) : null}
                        {editable ? (
                          <td>
                            <span className={k.reorder}>
                              <button type="button" className={ui.iconButton} aria-label={`Subir ${b.title}`} disabled={index === 0 || patch.isPending} onClick={() => void move(sorted, index, -1)} data-testid={T(`row-${b.id}-up`)}><ArrowUp size={20} aria-hidden="true" /></button>
                              <button type="button" className={ui.iconButton} aria-label={`Descer ${b.title}`} disabled={index === sorted.length - 1 || patch.isPending} onClick={() => void move(sorted, index, 1)} data-testid={T(`row-${b.id}-down`)}><ArrowDown size={20} aria-hidden="true" /></button>
                              <button type="button" className={ui.iconButton} aria-label={`Editar ${b.title}`} onClick={() => onEdit(b)} data-testid={T(`row-${b.id}-edit`)}><PencilSimple size={20} aria-hidden="true" /></button>
                              <button type="button" className={ui.iconButton} aria-label={`Excluir ${b.title}`} onClick={() => setDeleting(b)} data-testid={T(`row-${b.id}-delete`)}><Trash size={20} aria-hidden="true" /></button>
                            </span>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {deleting ? (
              <Dialog
                title={`Excluir o banner "${deleting.title}"?`}
                onClose={() => setDeleting(null)}
                testId={T('delete-dialog')}
                actions={
                  <>
                    <Button variant="destructive" loading={remove.isPending} loadingLabel="Excluindo…" onClick={() => void remove.mutateAsync(deleting.id).then(() => { toast.show('Banner excluído.'); setDeleting(null); }, (e) => setRowError(saveErrorMessage(e)))} data-testid={T('delete-confirm')}>Excluir banner</Button>
                    <Button variant="text" onClick={() => setDeleting(null)}>Cancelar</Button>
                  </>
                }
              >
                <p className="wb-text-body" style={{ margin: 0 }}>Ele sai do app na hora. Para só parar de mostrar, pause em vez de excluir.</p>
              </Dialog>
            ) : null}
          </>
        );
      }}
    </QueryBoundary>
  );
}

/** Seletor do destino: lojas e categorias vêm da API; produto e cupom por identificador (não há busca de produto no admin ainda). */
function DestinationPicker({ type, value, code, onValue, onCode, error }: { type: DestType; value: string; code: string; onValue: (v: string) => void; onCode: (v: string) => void; error?: string | undefined }) {
  const stores = useQuery({ queryKey: ['admin', 'banner-stores'], queryFn: () => adminStoresApi.list('approved'), enabled: type === 'store' });
  const categories = useQuery({ queryKey: keys.categories, queryFn: adminApi.categories, enabled: type === 'category' });
  if (type === 'none') return null;
  if (type === 'coupon') return <TextField label="Código do cupom" value={code} onChange={(e) => onCode(e.target.value.toUpperCase().slice(0, 20))} error={error} data-testid={T('dest-search')} />;
  if (type === 'product') return <TextField label="Identificador do produto" hint="Copie da fila de moderação ou do catálogo da loja." value={value} onChange={(e) => onValue(e.target.value.trim())} error={error} data-testid={T('dest-search')} />;
  const options = type === 'store' ? (stores.data?.data ?? []).map((s) => ({ id: s.id, name: s.name ?? 'Loja' })) : (categories.data?.data ?? []).flatMap((c) => [{ id: c.id, name: c.name }, ...c.children.map((child) => ({ id: child.id, name: `${c.name} / ${child.name}` }))]).filter((o) => o);
  return (
    <SelectField label={type === 'store' ? 'Loja' : 'Categoria'} value={value} onChange={(e) => onValue(e.target.value)} error={error} data-testid={T('dest-search')}>
      <option value="">{stores.isPending && type === 'store' ? 'Carregando…' : 'Escolha'}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </SelectField>
  );
}

function BannerForm({ banner, cities, onClose }: { banner: AdminBanner | null; cities: City[]; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(banner?.title ?? '');
  const [destType, setDestType] = useState<DestType>(banner?.destination.type ?? 'store');
  const [destId, setDestId] = useState(banner?.destination.id ?? '');
  const [destCode, setDestCode] = useState(banner?.destination.code ?? '');
  const [cityId, setCityId] = useState(banner?.cityId ?? '');
  const [startsAt, setStartsAt] = useState(banner ? toLocalInput(banner.startsAt) : '');
  const [endsAt, setEndsAt] = useState(banner ? toLocalInput(banner.endsAt) : '');
  const [active, setActive] = useState(banner?.active ?? true);
  const [picked, setPicked] = useState<File | null>(null);
  const [image, setImage] = useState<{ assetId: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const existing = banner ? smallest(banner.image.urls) : null;
  const preview = image?.preview ?? existing;

  async function accept(prepared: { blob: Blob }) {
    setPicked(null);
    setUploading(true);
    setFormError(null);
    try {
      const assetId = await marketingApi.uploadBannerImage(prepared.blob, 'banner.jpg');
      setImage({ assetId, preview: URL.createObjectURL(prepared.blob) });
      setErrors((e) => ({ ...e, image: '' }));
    } catch (error) {
      setFormError(error instanceof Error && !('status' in error) ? error.message : saveErrorMessage(error, 'Não foi possível enviar a imagem. Tente de novo.'));
    } finally {
      setUploading(false);
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!banner && !image) next.image = 'Escolha uma imagem.';
    if (title.trim().length < 1) next.title = 'Escreva o título do banner.';
    if ((destType === 'store' || destType === 'category' || destType === 'product') && !destId) next.dest = 'Escolha onde o banner leva.';
    if (destType === 'coupon' && !destCode) next.dest = 'Escolha onde o banner leva.';
    const s = fromLocalInput(startsAt);
    const e = fromLocalInput(endsAt);
    if (!s) next.startsAt = 'Informe quando começa.';
    if (!e) next.endsAt = 'Informe quando termina.';
    if (s && e && Date.parse(e) <= Date.parse(s)) next.endsAt = 'O fim precisa ser depois do início.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    setBusy(true);
    setFormError(null);
    const common = {
      title: title.trim(),
      cityId: cityId || null,
      destinationType: destType,
      destinationId: destType === 'store' || destType === 'category' || destType === 'product' ? destId : null,
      destinationCode: destType === 'coupon' ? destCode : null,
      startsAt: fromLocalInput(startsAt)!,
      endsAt: fromLocalInput(endsAt)!,
      active,
    };
    try {
      if (banner) await marketingApi.updateBanner(banner.id, { ...common, ...(image ? { imageAssetId: image.assetId } : {}) });
      else await marketingApi.createBanner({ ...common, imageAssetId: image!.assetId });
      await client.invalidateQueries({ queryKey: marketingKeys.banners });
      toast.show(!active ? 'Banner salvo, pausado.' : Date.parse(common.startsAt) > Date.now() ? 'Banner agendado.' : 'Banner publicado.');
      onClose();
    } catch (error) {
      const message = saveErrorMessage(error);
      setFormError(error instanceof Error && 'status' in error && (error as { status: number }).status === 422 ? 'Esse destino está inativo. Escolha outro.' : message);
      setConfirming(false);
      setBusy(false);
    }
  }

  function submit() {
    if (!validate()) return;
    const goesLive = active && Date.parse(fromLocalInput(startsAt) ?? '') <= Date.now();
    if (goesLive) setConfirming(true);
    else void save();
  }

  return (
    <>
      <Dialog
        title={banner ? 'Editar banner' : 'Novo banner'}
        wide
        onClose={onClose}
        locked={busy || uploading}
        testId={T('form')}
        actions={
          <>
            <Button onClick={submit} loading={busy} loadingLabel="Salvando…" data-testid={T('submit')}>{banner ? 'Salvar banner' : 'Criar banner'}</Button>
            <Button variant="text" onClick={onClose} disabled={busy}>Cancelar</Button>
          </>
        }
      >
        <div className={k.form}>
          {formError ? <Banner tone="danger" testId={T('form-error')}>{formError}</Banner> : null}
          <div>
            <p className="wb-text-label" style={{ margin: '0 0 8px' }}>Imagem (proporção 2 por 1)</p>
            {preview ? (
              <div className={k.preview} data-testid={T('preview')}>
                {/* eslint-disable-next-line @next/next/no-img-element -- prévia local ou imagem pública */}
                <img src={preview} alt={title ? `Banner: ${title}` : 'Prévia do banner'} />
                {title ? <span className={cx('wb-text-body-strong', k.previewTitle)}>{title}</span> : null}
              </div>
            ) : null}
            <label className={cx(ui.button, ui.secondary)} style={{ marginTop: 8, cursor: 'pointer' }}>
              {uploading ? 'Enviando…' : preview ? 'Trocar imagem' : 'Escolher imagem'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className={ui.srOnly} data-testid={T('image-upload')} onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (f.size > 5 * 1024 * 1024) setErrors((x) => ({ ...x, image: `Esse arquivo tem ${(f.size / 1048576).toFixed(0)} MB. O máximo é 5 MB.` })); else setPicked(f); } e.target.value = ''; }} />
            </label>
            {errors.image ? <p role="alert" className="wb-text-caption" style={{ color: 'var(--wb-color-text-danger)', margin: '4px 0 0' }}>{errors.image}</p> : null}
          </div>
          <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 40))} counter={{ value: title.length, max: 40 }} error={errors.title} data-testid={T('title-input')} />
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <legend className="wb-text-label">Onde o banner leva</legend>
            <div className={ui.row}>
              {(Object.keys(DEST_LABEL) as DestType[]).map((t) => (
                <label key={t} className={cx(ui.chip, 'wb-text-body')} style={{ cursor: 'pointer' }}>
                  <input type="radio" name="dest" value={t} checked={destType === t} onChange={() => { setDestType(t); setDestId(''); setDestCode(''); }} className={ui.srOnly} data-testid={T(`dest-${t}`)} />
                  <span aria-hidden="true">{destType === t ? '● ' : '○ '}</span>{DEST_LABEL[t]}
                </label>
              ))}
            </div>
          </fieldset>
          <DestinationPicker type={destType} value={destId} code={destCode} onValue={setDestId} onCode={setDestCode} error={errors.dest} />
          <SelectField label="Cidades" value={cityId} onChange={(e) => setCityId(e.target.value)} data-testid={T('cities')}>
            <option value="">Todas as cidades</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <div className={k.grid2}>
            <TextField label="Começa em" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} error={errors.startsAt} data-testid={T('start-input')} />
            <TextField label="Termina em" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={errors.endsAt} data-testid={T('end-input')} />
          </div>
          <Switch checked={active} onChange={setActive} label="Ativo" onText="Ativo" offText="Pausado" testId={T('active-switch')} />
        </div>
      </Dialog>
      {picked ? <ImageCropper source={picked} aspect={2} maxSide={1280} maxBytes={300_000} title="Recortar o banner (2 por 1)" onAccept={(r) => void accept(r)} onCancel={() => setPicked(null)} /> : null}
      {confirming ? (
        <Dialog
          title="Publicar o banner?"
          onClose={() => setConfirming(false)}
          locked={busy}
          testId={T('publish-dialog')}
          actions={
            <>
              <Button onClick={() => void save()} loading={busy} loadingLabel="Publicando…" data-testid={T('publish-confirm')}>Publicar banner</Button>
              <Button variant="text" onClick={() => setConfirming(false)} disabled={busy}>Cancelar</Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>Ele aparece para quem está em {cityName(cities, cityId || null)} e sai em {endsAt ? formatDateTime(fromLocalInput(endsAt) ?? '') : 'breve'}.</p>
        </Dialog>
      ) : null}
    </>
  );
}

function HighlightList({ cities, editable }: { cities: City[]; editable: boolean }) {
  const client = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: marketingKeys.highlights, queryFn: marketingApi.highlights });
  const [error, setError] = useState<string | null>(null);
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: { active: boolean } }) => marketingApi.updateHighlight(id, body), onSuccess: () => client.invalidateQueries({ queryKey: marketingKeys.highlights }) });
  const remove = useMutation({ mutationFn: (id: string) => marketingApi.deleteHighlight(id), onSuccess: () => client.invalidateQueries({ queryKey: marketingKeys.highlights }) });
  return (
    <QueryBoundary query={query} skeletonLabel="Carregando destaques" empty={(d) => (d.data.length === 0 ? <EmptyState icon={ImageIcon} title="Nenhum destaque" text="Destaques aparecem antes dos critérios automáticos na Início." testId={T('highlights-empty')} /> : null)}>
      {(data) => (
        <>
          <p className={cx('wb-text-caption', k.muted)}>Aparecem antes dos critérios automáticos.</p>
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <ul className={k.list}>
            {data.data.map((h: Highlight) => (
              <li key={h.id} className={k.card} data-testid={T(`highlight-${h.id}`)}>
                <div className={k.row}>
                  <span className="wb-text-body-strong">{h.kind === 'store' ? 'Loja' : 'Produto'}: {h.targetName ?? 'Item removido'}</span>
                  <StatusBadge status={bannerStatus({ ...h })} />
                </div>
                <span className={cx('wb-text-caption', k.muted)}>{cityName(cities, h.cityId)} · {formatDateTime(h.startsAt)} a {formatDateTime(h.endsAt)}{h.targetUnavailable ? ' · O item está inativo e sai da Início sozinho.' : ''}</span>
                {editable ? (
                  <div className={k.row}>
                    <Switch checked={h.active} onChange={() => void patch.mutateAsync({ id: h.id, body: { active: !h.active } }).then(() => toast.show(h.active ? 'Destaque pausado.' : 'Destaque ativado.'), (e) => setError(saveErrorMessage(e)))} label={`Destaque ${h.targetName ?? ''}`} onText="Ativo" offText="Pausado" testId={T(`highlight-${h.id}-switch`)} />
                    <Button variant="text" onClick={() => void remove.mutateAsync(h.id).then(() => toast.show('Destaque removido.'), (e) => setError(saveErrorMessage(e)))} data-testid={T(`highlight-${h.id}-delete`)}>Remover</Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </QueryBoundary>
  );
}

function HighlightForm({ cities, onClose }: { cities: City[]; onClose: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<'store' | 'product'>('store');
  const [target, setTarget] = useState('');
  const [cityId, setCityId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stores = useQuery({ queryKey: ['admin', 'banner-stores'], queryFn: () => adminStoresApi.list('approved'), enabled: kind === 'store' });

  async function save() {
    const next: Record<string, string> = {};
    if (!target) next.target = 'Escolha o item.';
    const s = fromLocalInput(startsAt);
    const e = fromLocalInput(endsAt);
    if (!s) next.startsAt = 'Informe quando começa.';
    if (!e) next.endsAt = 'Informe quando termina.';
    if (s && e && Date.parse(e) <= Date.parse(s)) next.endsAt = 'O fim precisa ser depois do início.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await marketingApi.createHighlight({ kind, targetId: target, cityId: cityId || null, startsAt: s!, endsAt: e!, active: true });
      await client.invalidateQueries({ queryKey: marketingKeys.highlights });
      toast.show('Destaque adicionado.');
      onClose();
    } catch (error) {
      setFormError(saveErrorMessage(error, 'Esse item está inativo ou não existe. Escolha outro.'));
      setBusy(false);
    }
  }
  return (
    <Dialog title="Adicionar destaque" onClose={onClose} locked={busy} testId={T('highlight-form')} actions={<><Button onClick={() => void save()} loading={busy} loadingLabel="Salvando…" data-testid={T('highlight-submit')}>Adicionar destaque</Button><Button variant="text" onClick={onClose} disabled={busy}>Cancelar</Button></>}>
      <div className={k.form}>
        {formError ? <Banner tone="danger">{formError}</Banner> : null}
        <SelectField label="Tipo" value={kind} onChange={(e) => { setKind(e.target.value as 'store' | 'product'); setTarget(''); }} data-testid={T('highlight-kind')}>
          <option value="store">Loja</option>
          <option value="product">Produto</option>
        </SelectField>
        {kind === 'store' ? (
          <SelectField label="Loja" value={target} onChange={(e) => setTarget(e.target.value)} error={errors.target} data-testid={T('highlight-search')}>
            <option value="">Escolha</option>
            {(stores.data?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name ?? 'Loja'}</option>)}
          </SelectField>
        ) : (
          <TextField label="Identificador do produto" hint="Copie da fila de moderação ou do catálogo da loja." value={target} onChange={(e) => setTarget(e.target.value.trim())} error={errors.target} data-testid={T('highlight-search')} />
        )}
        <SelectField label="Cidade" value={cityId} onChange={(e) => setCityId(e.target.value)}>
          <option value="">Todas as cidades</option>
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <div className={k.grid2}>
          <TextField label="Começa em" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} error={errors.startsAt} />
          <TextField label="Termina em" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={errors.endsAt} />
        </div>
      </div>
    </Dialog>
  );
}
