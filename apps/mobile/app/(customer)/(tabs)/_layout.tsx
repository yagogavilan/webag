import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { House, MagnifyingGlass, Receipt, User } from '../../../src/components/icons';
import { t } from '../../../src/i18n';
import { theme } from '../../../src/theme';

const tint = (focused: boolean): string => (focused ? theme.color.action.primary : theme.color.text.secondary);

/** Ícone da aba v3: ativa em bold-duotone (marca) com a barra inclinada de 8 graus no topo; inativa em linear 1,5. */
function TabIcon({ focused, icon: Icon }: { focused: boolean; icon: typeof House }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: 24, height: 4, borderRadius: 2, marginBottom: 4, backgroundColor: focused ? theme.color.brand[500] : 'transparent', transform: [{ skewX: `${theme.shape.lean}deg` }] }} />
      <Icon color={tint(focused)} duo={theme.color.brand[300]} size={theme.size.iconMd} weight={focused ? 'duotone' : 'regular'} />
    </View>
  );
}

/**
 * Barra inferior do cliente: Início, Buscar, Pedidos, Conta (favoritos ficam em Conta). Some nas telas de transação e no produto,
 * que são rotas da pilha acima desta (onda-3 §D9, onda-4 §0.1). Rótulo sempre visível: ícone sozinho não basta.
 */
export default function CustomerTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.action.primary,
        tabBarInactiveTintColor: theme.color.text.secondary,
        tabBarLabelStyle: { ...theme.text.micro, fontFamily: theme.text.bodyStrong.fontFamily },
        tabBarStyle: { minHeight: theme.size.tabBarHeight, backgroundColor: theme.color.surface.card, borderTopColor: theme.color.border.subtle },
        sceneStyle: { backgroundColor: theme.color.surface.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('account.tabHome'),
          tabBarButtonTestID: 'tabs.home',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon={House} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('account.tabSearch'),
          tabBarButtonTestID: 'tabs.search',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon={MagnifyingGlass} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('orders.tab'),
          tabBarButtonTestID: 'tabs.orders',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon={Receipt} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('account.tabAccount'),
          tabBarButtonTestID: 'tabs.account',
          tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon={User} />,
        }}
      />
    </Tabs>
  );
}
