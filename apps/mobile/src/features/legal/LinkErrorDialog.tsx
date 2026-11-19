import * as Clipboard from 'expo-clipboard';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import { t } from '../../i18n';

/** Folha "Não conseguimos abrir o link" com o endereço à vista e "Copiar endereço" (onda-7-licencas.md §2.5). */
export function LinkErrorDialog({ url, onClose }: { url: string | null; onClose: () => void }) {
  const toast = useToast();
  return (
    <Dialog onClose={onClose} testID="legal.link-error" text={url ? t('about.linkErrorText', { url }) : ''} title={t('about.linkError')} visible={url !== null}>
      <Button
        label={t('about.copyLink')}
        onPress={() => {
          if (url) void Clipboard.setStringAsync(url).then(() => toast.show(t('about.linkCopied')));
          onClose();
        }}
        testID="legal.link-copy"
      />
      <Button label={t('common.close')} onPress={onClose} variant="text" />
    </Dialog>
  );
}
