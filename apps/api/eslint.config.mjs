// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-*/**', 'coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Regra do time: `any` só com justificativa em comentário (eslint-disable com descrição).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    // DT-094 / ADR-018 D18: o `fn` de `runInTransaction` usa SÓ a transação recebida. Ler por `this.db` dentro dele prende uma 2ª conexão do pool com a 1ª já
    // presa (pool cheio = requisições se esperando). Leia parâmetros e categorias ANTES (`presentContext`, `draftLimit`, `prepareImport`) e passe `tx`.
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='runInTransaction'] MemberExpression[object.type='ThisExpression'][property.name='db']",
          message: 'DT-094: dentro de runInTransaction use só a transação (tx); leia o que precisar ANTES de chamar, para não prender uma 2ª conexão do pool.',
        },
      ],
    },
  },
  {
    // supertest devolve `res.body` como `any`; nos testes de API isso é esperado (as asserções validam o formato).
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);
