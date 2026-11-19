import { capOldest } from './bounded.js';

describe('capOldest', () => {
  it('descarta as entradas mais antigas quando passa do teto e não mexe abaixo dele', () => {
    const map = new Map<string, number>([['a', 1], ['b', 2], ['c', 3]]);
    capOldest(map, 5);
    expect([...map.keys()]).toEqual(['a', 'b', 'c']);
    capOldest(map, 2);
    expect([...map.keys()]).toEqual(['b', 'c']);
    const set = new Set(['x', 'y', 'z']);
    capOldest(set, 1);
    expect([...set]).toEqual(['z']);
  });
});
