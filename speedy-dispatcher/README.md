# Speedy Sweeties Dispatcher

Internal web application for live order dispatch, driver management, routing,
pickup locations, catalog operations, customer retention, and operational
checklists.

## Local development

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_API_BASE_URL` to the backend you intend to use.
4. Set `VITE_GOOGLE_MAPS_API_KEY` to a browser-restricted development key.
5. Start the app with `npm run dev`.

Both `VITE_` values are included in the browser bundle. Never put server
credentials or unrestricted API keys in them.

## Required checks

Run the complete dispatcher gate before opening or merging a pull request:

```bash
npm run check
```

This runs ESLint, the dispatcher unit tests, the TypeScript compiler, and the
production Vite build. The repository GitHub Actions workflow runs the same
gate for pushes and pull requests.

## Release behavior

The dispatcher is deployed from the repository's `main` branch by the
configured hosting service. A successful local build is not a deployment.
Follow the repository release checklist for approval, production verification,
and rollback requirements.

The Google Maps integration loads the Maps JavaScript API in the browser and
contains a narrow ESLint exception for that dynamic SDK boundary. The current
large components are not compiled with React Compiler; compiler-only hook rules
are disabled only where the legacy component structure requires it.
