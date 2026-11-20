import { Banner } from '../../components/Banner';
import { t } from '../../i18n';
import { useMaintenance } from './hooks';
import { maintenanceText } from './model';

/** Aviso amigável da sacola e do checkout quando a Webag pausou os pedidos novos (WB-121). A sacola não se perde: o texto diz isso. */
export function MaintenanceBanner({ testID = 'maintenance.banner' }: { testID?: string }) {
  const status = useMaintenance();
  if (!status) return null;
  return <Banner testID={testID} text={`${t('maintenance.title')}. ${maintenanceText(status.message, status.expectedBackAt)} ${t('checkout.maintenanceNote')}`} tone="warning" />;
}
