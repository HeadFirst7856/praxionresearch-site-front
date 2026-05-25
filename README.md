# Praxion Research Frontend

React + TypeScript + Vite SPA for the Praxion simulations dashboard.

## Requirements

- Node.js 20+
- npm
- Backend API reachable from the browser

## Local Setup

```bash
npm install
npm run dev
```

In local dev, Vite proxies `/api` to `http://127.0.0.1:8000` through `vite.config.ts`.

## Runtime Configuration

The frontend reads:

- `VITE_API_BASE_URL`: backend origin, without trailing slash. Empty means same origin.
- `VITE_BASE`: Vite base path for static assets. Use this when deploying to GitHub Pages project pages.

Examples:

```bash
# Local dev with Vite proxy
npm run dev

# Local dev hitting a Cloudflare Tunnel backend directly
VITE_API_BASE_URL=https://your-backend-tunnel.example.com npm run dev
```

## GitHub Pages Deploy

For a project page like:

```text
https://<github-user>.github.io/praxionresearch-site-front/
```

build with:

```bash
VITE_BASE=/praxionresearch-site-front/ \
VITE_API_BASE_URL=https://<your-cloudflare-tunnel-domain> \
npm run build
```

Publish the generated `dist/` directory to GitHub Pages.

If using a custom GitHub Pages domain at the root, use:

```bash
VITE_BASE=/ \
VITE_API_BASE_URL=https://<your-cloudflare-tunnel-domain> \
npm run build
```

## Backend Requirements

The backend must expose these authenticated REST endpoints:

- `GET /api/v1/simulation/dashboard`
- `POST /api/v1/simulation/run`
- `GET /api/v1/simulation/status`
- auth endpoints under `/api/v1/auth`

When backend is behind Cloudflare Tunnel, set backend CORS to allow the GitHub Pages origin:

```bash
CORS_ALLOWED_ORIGINS=https://<github-user>.github.io
```

If GitHub Pages uses a project path, CORS still uses only the origin (`https://<github-user>.github.io`), not the path.

## Build Check

```bash
npm run build
```

The build runs TypeScript first (`tsc -b`) and then Vite.
