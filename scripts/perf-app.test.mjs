// Testes das funções puras do medidor de desempenho. Rodar: node --test scripts/perf-app.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregate, blockingTime, classify, maxEventDuration, median, parseArgs, renderReport } from './perf-app.mjs';

test('mediana ignora vazio e valores inválidos', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(median([null, undefined, NaN, 5]), 5);
});

test('TBT soma só o que passa de 50 ms dentro da janela', () => {
  const lt = [[10, 120], [200, 40], [300, 90], [900, 500]];
  assert.equal(blockingTime(lt, 0, 400), 70 + 0 + 40);
});

test('INP aproximado = maior evento de toque na janela', () => {
  const ev = [[100, 40, 'pointerup'], [105, 90, 'click'], [110, 300, 'scroll'], [5000, 800, 'click']];
  assert.equal(maxEventDuration(ev, 100, 1000), 90);
  assert.equal(maxEventDuration([], 0, 10), null);
});

test('classifica requisições por tipo', () => {
  const api = 'http://127.0.0.1:3998';
  assert.equal(classify(`${api}/v1/home`, api), 'api');
  assert.equal(classify(`${api}/img/400/1.webp`, api), 'img');
  assert.equal(classify('http://x/_expo/static/js/web/entry-1.js', api), 'js');
  assert.equal(classify('http://x/assets/Figtree.ttf', api), 'font');
});

test('opções: padrões e validação', () => {
  const o = parseArgs([]);
  assert.equal(o.net, 'lento');
  assert.equal(o.cpu, 4);
  assert.equal(o.runs, 3);
  assert.ok(parseArgs(['--net', 'x']).errors.length > 0);
  assert.ok(parseArgs(['--runs', '0']).errors.length > 0);
  assert.equal(parseArgs(['--no-preload']).preload, false);
});

const step = (ms) => ({ label: 'Passo', ms, tbtMs: 10, inpMs: null, feedbackMs: 20, req: { total: 3, api: 2 }, bytes: { total: 1000, js: 0, img: 0, api: 1000, font: 0, other: 0 }, calls: [] });

test('agrega rodadas pela mediana e gera a tabela antes/depois', () => {
  const agg = aggregate([{ home: step(100) }, { home: step(300) }, { home: step(200) }]);
  assert.equal(agg.home.ms, 200);
  assert.deepEqual(agg.home.runsMs, [100, 300, 200]);
  const md = renderReport({ steps: { home: step(2000) } }, { steps: { home: step(1000) } });
  assert.match(md, /\| Fluxo \| Métrica \| Antes \| Depois \| Variação \| Meta \|/);
  assert.match(md, /-50%/);
});
