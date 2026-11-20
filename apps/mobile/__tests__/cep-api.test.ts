import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { lookupCep } from '../src/features/address/cep';

const mockRequest = jest.fn();
jest.mock('../src/api/http', () => ({ request: (...a: unknown[]) => mockRequest(...a) }));

const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria', email: 'm@x.com', emailVerified: true } });

beforeEach(async () => {
  jest.clearAllMocks();
  await sessionStore.clear();
});

describe('Consulta de CEP pela API (inventário, pendência 1)', () => {
  it('com conta: usa a API do Webag e nunca o ViaCEP', async () => {
    await login();
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    mockRequest.mockResolvedValue({ cep: '07900000', street: 'Rua das Palmeiras', neighborhood: 'Jardim Fortaleza', city: 'Francisco Morato', state: 'SP', lat: null, lng: null });
    expect(await lookupCep('07900-000')).toEqual({ kind: 'found', value: { street: 'Rua das Palmeiras', district: 'Jardim Fortaleza', city: 'Francisco Morato', state: 'SP' } });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('404 = não encontrado; 422 e rede = indisponível (campos à mão)', async () => {
    await login();
    mockRequest.mockRejectedValueOnce(new ApiError({ kind: 'problem', status: 404, code: 'NOT_FOUND' }));
    expect(await lookupCep('99999999')).toEqual({ kind: 'not-found' });
    mockRequest.mockRejectedValueOnce(new ApiError({ kind: 'problem', status: 422, code: 'CEP_LOOKUP_UNAVAILABLE' }));
    expect(await lookupCep('07900000')).toEqual({ kind: 'unavailable' });
    mockRequest.mockRejectedValueOnce(new ApiError({ kind: 'network' }));
    expect(await lookupCep('07900000')).toEqual({ kind: 'unavailable' });
  });

  it('visitante: segue no ViaCEP (a rota da API exige conta) e não chama a API', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ logradouro: 'Rua A', bairro: 'Centro', localidade: 'Franco da Rocha', uf: 'SP' }), { status: 200 }));
    expect(await lookupCep('07850-000')).toEqual({ kind: 'found', value: { street: 'Rua A', district: 'Centro', city: 'Franco da Rocha', state: 'SP' } });
    expect(mockRequest).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
