import { render, screen } from '@testing-library/react-native';
import CustomerHome from '../app/(customer)/index';

describe('Início do cliente', () => {
  it('mostra a marca como título acessível', async () => {
    await render(<CustomerHome />);

    expect(screen.getByRole('header', { name: 'webag' })).toBeOnTheScreen();
    expect(screen.getByText('Lojas da sua região')).toBeOnTheScreen();
  });
});
