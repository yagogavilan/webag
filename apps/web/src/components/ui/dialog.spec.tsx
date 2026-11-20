import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { Dialog } from './dialog';

function Harness({ locked }: { locked?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir</Button>
      {open ? (
        <Dialog title="Fechar Caieiras?" locked={locked} onClose={() => setOpen(false)} actions={<Button onClick={() => setOpen(false)}>Fechar cidade</Button>}>
          <input aria-label="Motivo" />
        </Dialog>
      ) : null}
    </>
  );
}

describe('Dialog', () => {
  it('leva o foco ao título, fecha com Esc e devolve o foco ao gatilho', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Abrir' });
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Fechar Caieiras?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fechar Caieiras?' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('prende o foco: Tab no último volta ao primeiro', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await userEvent.tab();
    expect(screen.getByLabelText('Motivo')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Fechar cidade' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText('Motivo')).toHaveFocus();
  });

  it('não fecha por Esc quando está travado (envio em andamento)', async () => {
    render(<Harness locked />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
