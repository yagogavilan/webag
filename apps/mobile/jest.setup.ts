// Mocks de módulos nativos usados pelo app. Os testes cobrem comportamento, não o módulo nativo.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-network', () => ({
  useNetworkState: jest.fn(() => ({ isConnected: true, isInternetReachable: true })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    __store: store,
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: jest.fn(() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`) };
});

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'undetermined', canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: -23.28, longitude: -46.74 } })),
  reverseGeocodeAsync: jest.fn(async () => []),
  geocodeAsync: jest.fn(async () => []),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@shopify/flash-list', () => require('./src/test/flash-list-mock'));

// expo-image é nativo: nos testes vira uma <Image> do RN (o cache e a transição são do módulo, não do app)
jest.mock('expo-image', () => {
  const { Image } = jest.requireActual('react-native');
  return { Image };
});

jest.mock('expo-router', () => {
  const router = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
  return {
    __router: router,
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({})),
    useNavigation: () => ({ addListener: () => () => undefined, isFocused: () => true }),
    usePathname: () => '/store/s1',
    useFocusEffect: (cb: () => void) => cb(),
    Redirect: () => null,
    Stack: Object.assign(() => null, { Screen: () => null }),
    Tabs: Object.assign(() => null, { Screen: () => null }),
    Link: () => null,
  };
});

jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({ on: jest.fn(), emit: jest.fn(), connect: jest.fn(), disconnect: jest.fn(), removeAllListeners: jest.fn() })),
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn(), activateKeepAwakeAsync: jest.fn(), deactivateKeepAwake: jest.fn() }));

jest.mock('react-native-webview', () => ({ WebView: () => null }));

// Reanimated roda a animação na thread de UI; nos testes usa o mock oficial (valores finais imediatos).
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
