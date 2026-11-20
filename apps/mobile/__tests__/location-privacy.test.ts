import * as Location from 'expo-location';
import config from '../app.config';
import { locateApproximately, roundCoord } from '../src/features/address/location';

const mocked = Location as unknown as {
  getForegroundPermissionsAsync: jest.Mock;
  getCurrentPositionAsync: jest.Mock;
  reverseGeocodeAsync: jest.Mock;
};

describe('Localização aproximada (SEC-179)', () => {
  it('iOS declara a precisão reduzida por padrão e o Android bloqueia a localização precisa e a de fundo', () => {
    expect(config.ios?.infoPlist?.NSLocationDefaultAccuracyReduced).toBe(true);
    expect(config.android?.blockedPermissions).toEqual(expect.arrayContaining(['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_BACKGROUND_LOCATION']));
  });

  it('arredonda para cerca de 1 km antes de chamar o geocodificador e antes de guardar', async () => {
    mocked.getForegroundPermissionsAsync.mockResolvedValueOnce({ status: 'granted', canAskAgain: true });
    mocked.getCurrentPositionAsync.mockResolvedValueOnce({ coords: { latitude: -23.281234, longitude: -46.743456 } });
    mocked.reverseGeocodeAsync.mockResolvedValueOnce([{ city: 'Francisco Morato', district: 'Centro', region: 'SP' }]);
    const outcome = await locateApproximately();
    expect(mocked.reverseGeocodeAsync).toHaveBeenCalledWith({ latitude: -23.28, longitude: -46.74 });
    expect(outcome).toEqual({ kind: 'ok', place: { latitude: -23.28, longitude: -46.74, city: 'Francisco Morato', district: 'Centro', state: 'SP' } });
    expect(roundCoord(-23.2849)).toBe(-23.28);
  });
});
