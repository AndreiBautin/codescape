import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const browserGlobals = ['window', 'document', 'navigator', 'requestAnimationFrame', 'localStorage'];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
      'no-console': ['error'],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message:
            'Take an Rng (src/core/rng.ts) as a parameter so visuals are reproducible from a seed.',
        },
        {
          selector:
            "MemberExpression[object.name='Date'][property.name='now'], NewExpression[callee.name='Date']",
          message: 'No ambient clock. Scenes receive dt; only src/main.ts reads the wall clock.',
        },
      ],
    },
  },
  {
    // core/ is pure: tree model, layouts, config, rng. It must not know about the DOM,
    // the filesystem API, three.js, or any rendering code — that is what keeps it testable.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...browserGlobals.map((name) => ({
          name,
          message: 'src/core is DOM-free; pass what you need in.',
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../scan/*', '../scenes/*', '../ui/*', 'three', 'three/*'],
              message: 'src/core may not depend on scan, scenes, ui or three.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/scenes/**/*.ts', 'src/scan/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../ui/*'],
              message: 'Scenes and scanners are driven by ui, never the reverse.',
            },
          ],
        },
      ],
    },
  },
  { files: ['src/core/log.ts'], rules: { 'no-console': 'off' } },
  { files: ['src/main.ts'], rules: { 'no-restricted-syntax': 'off' } },
);
