'use client';

import { Camera, ImageSquare } from '@phosphor-icons/react';
import type { CategoryTree } from '@webag/shared';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Banner, Button, CheckboxField, Dialog, QueryBoundary, SelectField, SkeletonRows, TextArea, TextField, ui, useToast } from '@/components/ui';
import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { settingsApi, settingsKeys, type ProfilePatch, type ProfileView } from '@/lib/api/store-settings';
import { maskPhone, onlyDigits } from '@/lib/br/mask';
import { validateStoreImage, type Prepared } from '@/lib/image/prepare';
import { uploadStoreImage } from '@/lib/image/upload';
import { maskedDocument, supportHref } from '@/lib/lojista-access';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { ImageCropper } from '../lojista/image-cropper';
import { SettingsFrame } from './settings-frame';
import { SettingsScreen } from './settings-screen';
import s from './loja.module.css';

const T = (id: string) => ltid('perfil', id);
const biggest = (urls: Record<string, string> | null | undefined): string | null => {
  if (!urls) return null;
  const key = Object.keys(urls).sort((a, b) => Number(b) - Number(a))[0];
  return key ? (urls[key] ?? null) : null;
};
function StoreImage({ url, alt }: { url: string; alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) ou imagem pública da loja
  return <img className={s.coverImg} src={url} alt={alt} />;
}
const initials = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export function ProfilePage() {
  return (
    <SettingsScreen>
      {({ store, refresh }) => <ProfileLoader storeId={store.id} approved={store.status === 'approved' || store.status === 'live'} refresh={refresh} />}
    </SettingsScreen>
  );
}

function ProfileLoader({ storeId, approved, refresh }: { storeId: string; approved: boolean; refresh: () => Promise<unknown> }) {
  const query = useQuery({ queryKey: settingsKeys.profile(storeId), queryFn: () => settingsApi.profile(storeId) });
  return (
    <QueryBoundary query={query} skeleton={<SkeletonRows rows={5} height={56} label="Carregando o perfil" />}>
      {(profile) => <ProfileForm storeId={storeId} profile={profile} approved={approved} refresh={refresh} />}
    </QueryBoundary>
  );
}

type Staged = { assetId: string; previewUrl: string } | null;

/** C2: logo, capa, nome, descrição, categorias e WhatsApp. Trocar o nome de loja aprovada volta à análise (C4). */
export function ProfileForm({ storeId, profile, approved, refresh }: { storeId: string; profile: ProfileView; approved: boolean; refresh: () => Promise<unknown> }) {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const categories = useQuery({ queryKey: ['lojista', 'categories'], queryFn: () => apiRequest<CategoryTree>('lojista', 'categories'), staleTime: 5 * 60_000 });
  const [name, setName] = useState(profile.name ?? '');
  const [description, setDescription] = useState(profile.description ?? '');
  const [main, setMain] = useState(profile.mainCategoryId ?? '');
  const [extra, setExtra] = useState<string[]>(profile.extraCategoryIds);
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp ? maskPhone(profile.whatsapp) : '');
  const [logo, setLogo] = useState<Staged>(null);
  const [cover, setCover] = useState<Staged>(null);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'main' | 'whatsapp' | 'extra', string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ kind: 'logo' | 'cover'; file: File } | null>(null);
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const options = (categories.data?.data ?? []).filter((category) => category.active);
  const dirty = name !== (profile.name ?? '') || description !== (profile.description ?? '') || main !== (profile.mainCategoryId ?? '') || extra.join() !== profile.extraCategoryIds.join() || onlyDigits(whatsapp) !== onlyDigits(profile.whatsapp ?? '') || logo !== null || cover !== null;
  const nameChanged = approved && name.trim() !== (profile.name ?? '');
  const logoUrl = logo?.previewUrl ?? biggest(profile.logo);
  const coverUrl = cover?.previewUrl ?? biggest(profile.cover);
  const extraOptions = options.filter((category) => category.id !== main);

  function pick(kind: 'logo' | 'cover', file: File | undefined) {
    if (!file) return;
    if (!online) return setImageError('Conecte-se para enviar a imagem.');
    const problem = validateStoreImage(file);
    setImageError(problem);
    if (!problem) setPicked({ kind, file });
  }

  async function accept(prepared: Prepared) {
    const current = picked;
    setPicked(null);
    if (!current) return;
    setUploading(current.kind);
    setImageError(null);
    try {
      const uploaded = await uploadStoreImage(storeId, current.kind === 'logo' ? 'store_logo' : 'store_cover', prepared.blob, `${current.kind}.jpg`);
      const staged = { assetId: uploaded.assetId, previewUrl: URL.createObjectURL(prepared.blob) };
      if (current.kind === 'logo') setLogo(staged);
      else setCover(staged);
    } catch (caught) {
      // A imagem anterior permanece (C5).
      setImageError(caught instanceof ApiError && caught.isNetwork ? 'Conecte-se para enviar a imagem.' : caught instanceof ApiError && caught.code === 'UPLOAD_REJECTED' ? (caught.detail ?? 'Essa imagem não serve.') : 'Não foi possível enviar. Tente de novo.');
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = 'Digite o nome da loja.';
    if (!main) next.main = 'Escolha a categoria principal.';
    if (onlyDigits(whatsapp).length !== 11) next.whatsapp = 'Digite o WhatsApp com DDD e 9 dígitos.';
    if (extra.length > 2) next.extra = 'Escolha até 2 outras categorias.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    if (nameChanged && !renaming) return setRenaming(true);
    setRenaming(false);
    setBusy(true);
    setFormError(null);
    const body: ProfilePatch = {
      name: name.trim(),
      description: description.trim(),
      mainCategoryId: main,
      extraCategoryIds: extra.filter((id) => id !== main),
      whatsapp: onlyDigits(whatsapp),
      ...(logo ? { logoAssetId: logo.assetId } : {}),
      ...(cover ? { coverAssetId: cover.assetId } : {}),
    };
    try {
      const saved = await settingsApi.saveProfile(storeId, body);
      await refresh();
      toast.show(saved.pendingReview ? 'Alterações salvas. O novo nome entra depois da análise.' : 'Alterações salvas. Já valem para os clientes.');
      router.push(asRoute('/lojista/loja'));
    } catch (caught) {
      setBusy(false);
      setFormError(caught instanceof ApiError && caught.fields.length > 0 ? caught.fields[0]!.message : saveErrorMessage(caught));
    }
  }

  const shownName = name.trim() || 'Sua loja';
  return (
    <>
      <SettingsFrame
        screen="perfil"
        title="Perfil da loja"
        dirty={dirty}
        busy={busy}
        submitLabel="Salvar alterações"
        onSubmit={() => void save()}
        error={formError}
        aside={
          <div className={ui.stack} data-testid={T('preview')}>
            <h2 className="wb-text-title2" style={{ margin: 0 }}>Como o cliente vê</h2>
            <div className={s.cover}>{coverUrl ? <StoreImage url={coverUrl} alt={`Capa da ${shownName}`} /> : <ImageSquare size={48} weight="duotone" aria-hidden="true" />}</div>
            <div className={ui.row}>
              <span className={s.logo}>{logoUrl ? <StoreImage url={logoUrl} alt={`Logo da ${shownName}`} /> : <span className="wb-text-title2" aria-hidden="true">{initials(shownName)}</span>}</span>
              <div>
                <div className="wb-text-title2">{shownName}</div>
                <div className="wb-text-caption">Novo</div>
              </div>
            </div>
            {description ? <p className="wb-text-body" style={{ margin: 0 }}>{description}</p> : null}
          </div>
        }
      >
        <div className={ui.stack}>
          <div className={s.cover}>
            {coverUrl ? <StoreImage url={coverUrl} alt={`Capa da ${shownName}`} /> : <span className="wb-text-caption"><ImageSquare size={32} aria-hidden="true" /> Sem foto</span>}
          </div>
          <div className={ui.row}>
            <Button variant="secondary" icon={<Camera size={20} aria-hidden="true" />} onClick={() => coverInput.current?.click()} loading={uploading === 'cover'} loadingLabel="Enviando a capa…" disabled={uploading !== null} data-testid={T('cover-change')}>Trocar capa</Button>
            <span className={s.logo}>{logoUrl ? <StoreImage url={logoUrl} alt={`Logo da ${shownName}`} /> : <span className="wb-text-title2" aria-hidden="true">{initials(shownName)}</span>}</span>
            <Button variant="secondary" icon={<Camera size={20} aria-hidden="true" />} onClick={() => logoInput.current?.click()} loading={uploading === 'logo'} loadingLabel="Enviando a logo…" disabled={uploading !== null} data-testid={T('logo-change')}>Trocar logo</Button>
          </div>
          <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick('cover', e.target.files?.[0]); e.target.value = ''; }} data-testid={T('cover-file')} />
          <input ref={logoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick('logo', e.target.files?.[0]); e.target.value = ''; }} data-testid={T('logo-file')} />
          <p className="wb-text-caption" style={{ margin: 0 }}>Uma foto da fachada ou do balcão passa mais confiança.</p>
          {imageError ? <Banner tone="danger" testId={T('image-error')}>{imageError}</Banner> : null}
        </div>

        <TextField label="Nome da loja" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="organization" data-testid={T('name-input')} />
        <TextArea label="Descrição" value={description} onChange={(e) => setDescription(e.target.value.slice(0, 300))} counter={{ value: description.length, max: 300 }} rows={3} data-testid={T('description-input')} />
        {categories.isPending ? (
          <SkeletonRows rows={1} height={48} label="Carregando as categorias" />
        ) : categories.isError ? (
          <Banner tone="danger" action={<Button variant="secondary" size="sm" onClick={() => void categories.refetch()}>Tentar de novo</Button>}>Não conseguimos carregar as categorias.</Banner>
        ) : (
          <>
            <SelectField label="Categoria principal" value={main} onChange={(e) => setMain(e.target.value)} error={errors.main} data-testid={T('category-main')}>
              <option value="">Escolha uma categoria</option>
              {options.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </SelectField>
            <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
              <legend className="wb-text-caption-strong">Outras categorias (até 2)</legend>
              {extraOptions.map((category) => (
                <CheckboxField
                  key={category.id}
                  label={category.name}
                  checked={extra.includes(category.id)}
                  disabled={!extra.includes(category.id) && extra.length >= 2}
                  onChange={(e) => setExtra((current) => (e.target.checked ? [...current, category.id] : current.filter((id) => id !== category.id)))}
                  data-testid={T(`category-extra-${category.id}`)}
                />
              ))}
              {errors.extra ? <p role="alert" className="wb-text-caption" style={{ color: 'var(--wb-color-text-danger)' }}>{errors.extra}</p> : null}
            </fieldset>
          </>
        )}
        <TextField label="WhatsApp da loja" type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(maskPhone(e.target.value))} placeholder="(00) 00000-0000" error={errors.whatsapp} autoComplete="tel" data-testid={T('whatsapp-input')} />
        <div>
          <div className="wb-text-caption-strong">{profile.documentType === 'cnpj' ? 'CNPJ' : 'CPF'}</div>
          <div className={ui.row}>
            <span className="wb-text-body" data-testid={T('document')}>{maskedDocument(profile.document)}</span>
            <a href={supportHref()} target="_blank" rel="noopener noreferrer" className="wb-text-body-strong">Pedir mudança</a>
          </div>
        </div>
      </SettingsFrame>

      {picked ? <ImageCropper source={picked.file} aspect={picked.kind === 'logo' ? 1 : 16 / 9} maxSide={picked.kind === 'logo' ? 512 : 1280} title={picked.kind === 'logo' ? 'Recortar a logo' : 'Recortar a capa'} onAccept={(result) => void accept(result)} onCancel={() => setPicked(null)} /> : null}
      {renaming ? (
        <Dialog
          title="Mudar o nome precisa de nova análise."
          onClose={() => setRenaming(false)}
          testId={T('rename-dialog')}
          actions={
            <>
              <Button onClick={() => void save()} data-testid={T('rename-confirm')}>Enviar para análise</Button>
              <Button variant="text" onClick={() => setRenaming(false)}>Cancelar</Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>O nome atual continua no ar até a resposta do Webag.</p>
        </Dialog>
      ) : null}
    </>
  );
}
