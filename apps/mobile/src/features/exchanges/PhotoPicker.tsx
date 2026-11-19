import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Camera, Image as ImageIcon, X } from '../../components/icons';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { theme } from '../../theme';
import { uploadExchangePhoto } from '../../api/exchanges-api';
import { openNotificationSettings } from '../notifications/push';

export interface Photo {
  key: string;
  uri: string;
  /** id do upload no servidor, depois de enviada. */
  id: string | null;
  status: 'uploading' | 'ok' | 'failed';
  mimeType: string;
  sizeBytes: number;
}

const MAX_PHOTOS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png'];

/**
 * Fotos do defeito (1 a 5). Câmera ou galeria pelo seletor do sistema (Android Photo Picker e PHPicker, sem permissão ampla de
 * fotos). Cada foto sobe sozinha, com estado próprio: falha de uma não derruba as outras. EXIF e local saem no servidor.
 */
export function PhotoPicker({ photos, onChange }: { photos: Photo[]; onChange: (next: Photo[]) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const upload = async (photo: Photo, current: Photo[]) => {
    const update = (patch: Partial<Photo>) => onChange(current.map((p) => (p.key === photo.key ? { ...p, ...patch } : p)));
    try {
      const id = await uploadExchangePhoto(photo);
      update({ id, status: 'ok' });
    } catch {
      update({ status: 'failed' });
    }
  };

  const add = async (asset: ImagePicker.ImagePickerAsset | undefined) => {
    if (!asset) return;
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const sizeBytes = asset.fileSize ?? 0;
    if (!ALLOWED.includes(mimeType)) return setMessage(t('exchange.photoFormat'));
    if (sizeBytes > MAX_BYTES) return setMessage(t('exchange.photoTooBig'));
    setMessage(null);
    const photo: Photo = { key: `${Date.now()}-${photos.length}`, uri: asset.uri, id: null, status: 'uploading', mimeType, sizeBytes };
    const next = [...photos, photo];
    onChange(next);
    await upload(photo, next);
  };

  const camera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setDenied(true);
      return;
    }
    setDenied(false);
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled) await add(result.assets[0]);
  };

  const gallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled) await add(result.assets[0]);
  };

  const full = photos.length >= MAX_PHOTOS;
  return (
    <View style={styles.wrap} testID="exchange.photos">
      <Text accessibilityRole="header" variant="bodyStrong">{t('exchange.photosTitle')}</Text>
      <Text color="secondary" variant="caption">{t('exchange.photosHelp')}</Text>
      <View style={styles.grid}>
        {photos.map((p, i) => (
          <View key={p.key} style={styles.thumbBox}>
            <Image accessibilityLabel={`${t('exchange.photosTitle')} ${i + 1}`} contentFit="cover" source={{ uri: p.uri }} style={[styles.thumb, p.status !== 'ok' && styles.dim]} />
            <Pressable accessibilityLabel={t('exchange.photoRemove', { n: i + 1 })} accessibilityRole="button" hitSlop={theme.hitSlopFor(24)} onPress={() => onChange(photos.filter((x) => x.key !== p.key))} style={styles.remove} testID={`exchange.photo-${i + 1}-remove`}>
              <X color={theme.color.text.onBrand} size={16} weight="bold" />
            </Pressable>
            {p.status === 'failed' ? (
              <Pressable accessibilityRole="button" onPress={() => { onChange(photos.map((x) => (x.key === p.key ? { ...x, status: 'uploading' } : x))); void upload(p, photos); }} style={styles.retry}>
                <Text style={styles.retryText} variant="micro">{t('exchange.photoFailed', { n: i + 1 })}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <Button disabled={full} icon={<Camera color={theme.color.text.brand} size={theme.size.iconMd} />} label={t('exchange.photoCamera')} onPress={() => void camera()} testID="exchange.photo-camera" variant="secondary" />
        <Button disabled={full} icon={<ImageIcon color={theme.color.text.brand} size={theme.size.iconMd} />} label={t('exchange.photoGallery')} onPress={() => void gallery()} testID="exchange.photo-gallery" variant="secondary" />
      </View>
      {message ? <Banner text={message} tone="danger" /> : null}
      {denied ? <Banner actionLabel={t('exchange.openSettings')} onAction={() => void openNotificationSettings()} text={t('exchange.photoDenied')} tone="warning" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.space[2] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] },
  thumbBox: { width: 72, height: 72 },
  thumb: { width: 72, height: 72, borderRadius: theme.radius.lg },
  dim: { opacity: 0.5 },
  remove: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: theme.color.neutral[800], alignItems: 'center', justifyContent: 'center' },
  retry: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.color.feedback.danger.base, borderBottomLeftRadius: theme.radius.lg, borderBottomRightRadius: theme.radius.lg, padding: 2 },
  retryText: { color: theme.color.text.onBrand, textAlign: 'center' },
  actions: { gap: theme.space[2] },
});
