import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // These files integrate with the browser-loaded Google Maps SDK and its
    // dynamically patched marker constructors. Keep the exception narrow.
    files: [
      'src/App.tsx',
      'src/RoutingPreviewEnhancerOriginalPins.tsx',
      'src/driverMarkerPinFix.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // These components predate the React Compiler and intentionally use stable
    // closures declared later in the component body.
    files: ['src/App.tsx', 'src/RoutingPreviewEnhancerOriginalPins.tsx'],
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
  {
    // Login state is restored once from session storage during hydration.
    files: ['src/App.tsx'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
