// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/web/next-env.d.ts',
      'AGENTS.md',
      'docs/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    files: ['packages/runtime/**/*.ts', 'packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['fastify', 'next', 'ai', '@persist/provider', '@persist/storage'],
              message: 'Core packages must remain framework- and provider-agnostic.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/memory/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'fastify',
                'next',
                'ai',
                '@persist/provider',
                '@persist/runtime',
                '@persist/storage',
                'better-sqlite3',
                'drizzle-orm',
              ],
              message:
                'Memory package is pure orchestration/policy — no runtime, provider, or storage.',
            },
          ],
        },
      ],
    },
  },
);
