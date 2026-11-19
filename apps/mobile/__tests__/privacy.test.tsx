import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import DeleteAccountScreen from '../app/privacy/delete';
import ExportDataScreen from '../app/privacy/export';
import NotificationPrefsScreen from '../app/privacy/notifications';
import { ApiError } from '../src/api/problem';
import { sessionStore } from '../src/api/session';
import { cartActions } from '../src/features/cart/store';
import { renderScreen } from '../src/test/render';

const mockOverview = jest.fn();
const mockDelete = jest.fn();
const mockExportStatus = jest.fn();
const mockExportAsk = jest.fn();
const mockExportLink = jest.fn();
const mockConsents = jest.fn();
const mockChangeConsent = jest.fn();
jest.mock('../src/api/privacy-api', () => ({
  fetchDeletionOverview: (...a: unknown[]) => mockOverview(...a),
  removeMyAccount: (...a: unknown[]) => mockDelete(...a),
  cancelMyDeletion: jest.fn(),
  fetchDataExport: (...a: unknown[]) => mockExportStatus(...a),
  askDataExport: (...a: unknown[]) => mockExportAsk(...a),
  exportDownloadLink: (...a: unknown[]) => mockExportLink(...a),
  fetchConsents: (...a: unknown[]) => mockConsents(...a),
  changeConsent: (...a: unknown[]) => mockChangeConsent(...a),
  fetchHelp: jest.fn(),
}));

const login = () => sessionStore.setSession({ accessToken: 'a', refreshToken: 'r'.repeat(40), accessExpiresAt: Date.now() + 900_000, user: { id: 'u1', name: 'Maria Souza', email: 'maria@gmail.com', emailVerified: true } });
const overview = (over: Record<string, unknown> = {}) => ({ canDelete: true, blockers: [], hasPassword: true, ownsStore: false, anonymizationDays: 15, fiscalRetentionYears: 5, regretHours: 72, ...over });

beforeEach(async () => {
  jest.clearAllMocks();
  await login();
});

describe('Excluir minha conta (CC4, SEC-166)', () => {
  it('mostra o que acontece com os números do servidor e só ativa a exclusão com a senha e a confirmação', async () => {
    mockOverview.mockResolvedValue(overview());
    mockDelete.mockResolvedValue({ status: 'pending', effectiveAt: '2026-11-22T12:00:00Z', cancelableUntil: '2026-11-22T12:00:00Z' });
    await renderScreen(<DeleteAccountScreen />);
    expect(await screen.findByText(/em até 15 dias/)).toBeOnTheScreen();
    expect(screen.getByText(/por até 5 anos/)).toBeOnTheScreen();
    expect(screen.getByText(/72 horas para mudar de ideia/)).toBeOnTheScreen();

    // sem senha: explica, não abre a confirmação
    await fireEvent.press(screen.getByTestId('account.delete-submit'));
    expect(await screen.findByText('Digite sua senha para continuar.')).toBeOnTheScreen();
    expect(mockDelete).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('account.delete-password-input'), 'Segredo123');
    await fireEvent.press(screen.getByTestId('account.delete-submit'));
    expect(await screen.findByText('Excluir sua conta?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('account.delete-confirm'));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('Segredo123'));
    expect(await screen.findByText('Sua conta foi excluída')).toBeOnTheScreen();
    expect(screen.getByText(/Você tem até .* para mudar de ideia/)).toBeOnTheScreen();
    expect(screen.getByTestId('account.delete-undo')).toBeOnTheScreen();
    // a sessão e a sacola do aparelho saíram
    expect(sessionStore.getState().status).toBe('anonymous');
  });

  it('senha errada mantém a conta e avisa', async () => {
    mockOverview.mockResolvedValue(overview());
    mockDelete.mockRejectedValue(new ApiError({ kind: 'problem', status: 403, code: 'INVALID_PASSWORD' }));
    await renderScreen(<DeleteAccountScreen />);
    await screen.findByTestId('account.delete-submit');
    await fireEvent.changeText(screen.getByTestId('account.delete-password-input'), 'errada');
    await fireEvent.press(screen.getByTestId('account.delete-submit'));
    await fireEvent.press(await screen.findByTestId('account.delete-confirm'));
    expect(await screen.findByText('Senha incorreta.')).toBeOnTheScreen();
    expect(sessionStore.getState().status).toBe('authenticated');
  });

  it('com pedido em aberto bloqueia e lista o que falta; o botão de excluir não aparece', async () => {
    mockOverview.mockResolvedValue(overview({ canDelete: true, blockers: [{ kind: 'order', id: 'o1', number: '4821', status: 'out_for_delivery' }] }));
    await renderScreen(<DeleteAccountScreen />);
    expect(await screen.findByText('Conclua antes de excluir')).toBeOnTheScreen();
    expect(screen.getByText('Pedido #4821 · out_for_delivery')).toBeOnTheScreen();
    expect(screen.queryByTestId('account.delete-submit')).toBeNull();
  });

  it('conta sem senha (login social) explica o caminho e não oferece o botão', async () => {
    mockOverview.mockResolvedValue(overview({ hasPassword: false }));
    await renderScreen(<DeleteAccountScreen />);
    expect(await screen.findByTestId('account.delete-no-password')).toBeOnTheScreen();
    expect(screen.queryByTestId('account.delete-submit')).toBeNull();
  });

  it('erro ao carregar mostra tentar de novo', async () => {
    mockOverview.mockRejectedValue(new ApiError({ kind: 'server', status: 500 }));
    await renderScreen(<DeleteAccountScreen />);
    expect(await screen.findByTestId('account.delete-error')).toBeOnTheScreen();
  });

  it('exclusão imediata (sem arrependimento) não oferece cancelar', async () => {
    mockOverview.mockResolvedValue(overview({ regretHours: 0 }));
    mockDelete.mockResolvedValue({ status: 'completed', effectiveAt: '2026-11-19T12:00:00Z', cancelableUntil: null });
    await cartActions.clear();
    await renderScreen(<DeleteAccountScreen />);
    await screen.findByTestId('account.delete-submit');
    await fireEvent.changeText(screen.getByTestId('account.delete-password-input'), 'Segredo123');
    await fireEvent.press(screen.getByTestId('account.delete-submit'));
    await fireEvent.press(await screen.findByTestId('account.delete-confirm'));
    expect(await screen.findByText('Sua conta foi excluída')).toBeOnTheScreen();
    expect(screen.queryByTestId('account.delete-undo')).toBeNull();
  });
});

describe('Exportar meus dados (CC3, SEC-166)', () => {
  it('pede com a senha e mostra "Pedido recebido"', async () => {
    mockExportStatus.mockResolvedValue({ latest: null, nextRequestAt: null });
    mockExportAsk.mockResolvedValue({ id: 'e1', status: 'queued', requestedAt: '2026-11-19T10:15:00Z', readyAt: null, expiresAt: null, sizeBytes: null });
    await renderScreen(<ExportDataScreen />);
    await screen.findByTestId('account.export-submit');
    await fireEvent.press(screen.getByTestId('account.export-submit'));
    expect(await screen.findByText('Digite sua senha para continuar.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('account.export-password-input'), 'Segredo123');
    await fireEvent.press(screen.getByTestId('account.export-submit'));
    await waitFor(() => expect(mockExportAsk).toHaveBeenCalledWith('Segredo123'));
    expect(await screen.findByText('Pedido recebido')).toBeOnTheScreen();
  });

  it('e-mail não confirmado leva a confirmar o e-mail', async () => {
    mockExportStatus.mockResolvedValue({ latest: null, nextRequestAt: null });
    mockExportAsk.mockRejectedValue(new ApiError({ kind: 'problem', status: 403, code: 'EMAIL_VERIFICATION_REQUIRED' }));
    await renderScreen(<ExportDataScreen />);
    await screen.findByTestId('account.export-submit');
    await fireEvent.changeText(screen.getByTestId('account.export-password-input'), 'Segredo123');
    await fireEvent.press(screen.getByTestId('account.export-submit'));
    expect(await screen.findByTestId('account.export-email-banner')).toBeOnTheScreen();
  });

  it('em andamento deixa o botão inerte com o motivo no rótulo', async () => {
    mockExportStatus.mockResolvedValue({ latest: { id: 'e1', status: 'processing', requestedAt: '2026-11-19T10:15:00Z', readyAt: null, expiresAt: null, sizeBytes: null }, nextRequestAt: null });
    await renderScreen(<ExportDataScreen />);
    expect(await screen.findByText('Você já tem uma em andamento')).toBeOnTheScreen();
    expect(screen.getByTestId('account.export-status')).toBeOnTheScreen();
  });

  it('pronta: gera o link de uso único e abre no navegador', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    mockExportStatus.mockResolvedValue({ latest: { id: 'e1', status: 'ready', requestedAt: '2026-11-18T10:15:00Z', readyAt: '2026-11-18T10:20:00Z', expiresAt: '2026-11-25T10:20:00Z', sizeBytes: 2048 }, nextRequestAt: '2026-11-19T10:15:00Z' });
    mockExportLink.mockResolvedValue({ url: 'https://api.webag.com.br/v1/exports/abc', expiresAt: '2026-11-19T10:20:00Z' });
    await renderScreen(<ExportDataScreen />);
    await fireEvent.press(await screen.findByTestId('account.export-download'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://api.webag.com.br/v1/exports/abc'));
    expect(mockExportLink).toHaveBeenCalledWith('e1');
  });
});

describe('Notificações e consentimentos (CC6)', () => {
  it('ofertas começam desligadas, cada Switch salva na hora e o estado é dito em texto', async () => {
    const base = { consents: { marketing_push: false, marketing_email: false, precise_location: false, waitlist: false } };
    mockConsents.mockResolvedValue(base);
    mockChangeConsent.mockResolvedValue({ consents: { ...base.consents, marketing_email: true } });
    await renderScreen(<NotificationPrefsScreen />);
    const email = await screen.findByTestId('account.prefs-offers-email');
    expect(email.props.accessibilityLabel).toBe('Ofertas por e-mail, desligado');
    await fireEvent(email, 'valueChange', true);
    await waitFor(() => expect(mockChangeConsent).toHaveBeenCalledWith('marketing_email', true));
    expect(screen.getByText('Sempre ligado')).toBeOnTheScreen();
  });

  it('falha ao salvar avisa e mantém o valor antigo', async () => {
    mockConsents.mockResolvedValue({ consents: { marketing_push: false, marketing_email: false, precise_location: false, waitlist: false } });
    mockChangeConsent.mockRejectedValue(new ApiError({ kind: 'server', status: 500 }));
    await renderScreen(<NotificationPrefsScreen />);
    await fireEvent(await screen.findByTestId('account.prefs-offers-email'), 'valueChange', true);
    expect(await screen.findByText('Não foi possível salvar. Tentar de novo.')).toBeOnTheScreen();
    expect(screen.getByTestId('account.prefs-offers-email').props.accessibilityLabel).toBe('Ofertas por e-mail, desligado');
  });
});
