import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { fetchCurrentLegalDocument } from '../../src/api/auth-api';
import { AsyncBoundary } from '../../src/components/AsyncBoundary';
import { Header } from '../../src/components/Header';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { Text } from '../../src/components/Text';
import { LEGAL_REVIEWED, WEB_PUBLIC_URL } from '../../src/features/checkout/config';
import { LegalBody } from '../../src/features/legal/LegalBody';
import { formatVigencia } from '../../src/features/legal/legal-text';
import { t } from '../../src/i18n';
import { theme } from '../../src/theme';

type LegalType = 'customer_terms' | 'privacy';

/** Termos e privacidade em tela própria (WB-117): abre a versão vigente e volta sem perder o formulário de origem. */
export default function LegalScreen() {
  const { type: raw } = useLocalSearchParams<{ type?: string }>();
  const type: LegalType = raw === 'privacy' ? 'privacy' : 'customer_terms';
  const query = useQuery({ queryKey: ['legal', type], queryFn: () => fetchCurrentLegalDocument(type), staleTime: 60 * 60_000 });

  const vigencia = formatVigencia(query.data?.effectiveAt);

  return (
    <Screen header={<Header title={type === 'privacy' ? t('legal.privacy') : t('legal.terms')} />}>
      <AsyncBoundary
        isError={query.isError && !query.data}
        isLoading={query.isLoading}
        onRetry={() => void query.refetch()}
        skeleton={
          <View style={styles.skeleton}>
            <Skeleton height={24} width="60%" />
            <Skeleton />
            <Skeleton />
            <Skeleton width="80%" />
          </View>
        }
      >
        {query.data ? (
          <View style={styles.doc} testID="legal.content">
            <Text variant="title2">{query.data.title}</Text>
            {/* Mesmo critério do site (DEC-078, DEC-082): sem aprovação do jurídico, só o aviso de revisão; aprovado, versão e vigência. */}
            <Text color="secondary" testID="legal.meta" variant="caption">
              {LEGAL_REVIEWED && vigencia ? t('legal.approvedMeta', { n: query.data.version, date: vigencia }) : LEGAL_REVIEWED ? t('legal.version', { n: query.data.version }) : t('legal.reviewNotice')}
            </Text>
            {/* Texto puro: o conteúdo é do admin e nunca é interpretado como HTML (contrato: "exibir como texto puro"); só títulos, listas e negrito simples. */}
            <LegalBody content={query.data.content} effectiveAt={query.data.effectiveAt} reviewed={LEGAL_REVIEWED} siteUrl={WEB_PUBLIC_URL} version={query.data.version} />
          </View>
        ) : null}
      </AsyncBoundary>
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeleton: { gap: theme.space[3] },
  doc: { gap: theme.space[3] },
});
