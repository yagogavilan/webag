import { Tabs } from 'expo-router';
import { House, MagnifyingGlass, UserCircle } from '../../../src/components/icons';
import { t } from '../../../src/i18n';
import { theme } from '../../../src/theme';

const tint = (focused: boolean): string => (focused ? theme.color.text.brand : theme.color.text.secondary);

/**
 * Barra inferior do cliente: Início, Buscar, Conta (favoritos ficam em Conta). Some nas telas de transação e no produto,
 * que são rotas da pilha acima desta (onda-3 §D9, onda-4 §0.1). Rótulo sempre visível: ícone sozinho não basta.
 */
export default function CustomerTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.text.brand,
        tabBarInactiveTintColor: theme.color.text.secondary,
        tabBarLabelStyle: { ...theme.text.micro },
        tabBarStyle: { minHeight: theme.size.tabBarHeight, backgroundColor: theme.color.surface.card, borderTopColor: theme.color.border.subtle },
        sceneStyle: { backgroundColor: theme.color.surface.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('account.tabHome'),
          tabBarButtonTestID: 'tabs.home',
          tabBarIcon: ({ focused }) => <House color={tint(focused)} size={theme.size.iconMd} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('account.tabSearch'),
          tabBarButtonTestID: 'tabs.search',
          tabBarIcon: ({ focused }) => <MagnifyingGlass color={tint(focused)} size={theme.size.iconMd} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('account.tabAccount'),
          tabBarButtonTestID: 'tabs.account',
          tabBarIcon: ({ focused }) => <UserCircle color={tint(focused)} size={theme.size.iconMd} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
    </Tabs>
  );
}
