import { PAYMENT_STATUSES } from './db/schema.js';
import { canTransition } from './payments.service.js';

describe('máquina de estados da tentativa de pagamento (SEC-033)', () => {
  it('só avança: pending → approved → refunded', () => {
    expect(canTransition('pending', 'approved')).toBe(true);
    expect(canTransition('pending_3ds', 'approved')).toBe(true);
    expect(canTransition('approved', 'refunded')).toBe(true);
  });

  it('nunca regride nem repete', () => {
    expect(canTransition('approved', 'pending')).toBe(false);
    expect(canTransition('approved', 'declined')).toBe(false);
    expect(canTransition('approved', 'approved')).toBe(false);
    expect(canTransition('refunded', 'approved')).toBe(false);
    expect(canTransition('declined', 'approved')).toBe(false);
  });

  it('estados finais não têm saída', () => {
    for (const final of ['declined', 'expired', 'cancelled', 'refunded', 'divergent'] as const) {
      for (const to of PAYMENT_STATUSES) expect(canTransition(final, to)).toBe(false);
    }
  });
});
