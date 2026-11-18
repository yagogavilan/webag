// `@webag/tokens/css` aponta para css/tokens.css via "exports"; o subcaminho não termina em .css,
// então a declaração genérica de CSS do Next não cobre (TS 6: noUncheckedSideEffectImports).
declare module '@webag/tokens/css';
