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
      'scripts/**',
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
    files: ['packages/runtime/**/*.ts'],
    ignores: ['packages/runtime/**/*.test.ts', 'packages/runtime/**/*.e2e.test.ts'],
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
                '@persist/storage',
                '@persist/mcp-tool-adapter',
                '@persist/planning',
              ],
              message: 'Core packages must remain framework- and provider-agnostic.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/shared/**/*.ts'],
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
    files: ['packages/tool/**/*.ts'],
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
                '@persist/mcp-tool-adapter',
                'better-sqlite3',
                'drizzle-orm',
              ],
              message: 'Tool package is pure policy — no I/O or integration deps.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/mcp-tool-adapter/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@persist/runtime'],
              message: 'MCP adapter must not depend on runtime.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/plan/**/*.ts'],
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
                '@persist/mcp-tool-adapter',
                'better-sqlite3',
                'drizzle-orm',
              ],
              message: 'Plan package is pure policy — no I/O or integration deps.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/planning/**/*.ts'],
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
                '@persist/mcp-tool-adapter',
                '@persist/tool',
                'better-sqlite3',
                'drizzle-orm',
              ],
              message: 'Planning package may only depend on shared and plan.',
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
