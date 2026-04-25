# Speedy Sweeties Backend - Phase 1

Production-style backend for a local delivery ordering app built with:

- Node.js
- TypeScript
- Express
- PostgreSQL
- Prisma
- Zod

## What this includes

- Order model
- Order items model
- Create order endpoint
- Fetch order by ID endpoint
- List orders endpoint
- Update order status endpoint
- Validation
- Error handling
- Environment config
- Clean folder structure

## Endpoints

- `GET /api/v1/health`
- `POST /api/v1/orders`
- `GET /api/v1/orders`
- `GET /api/v1/orders/:id`
- `PATCH /api/v1/orders/:id/status`

## Local setup

1. Install packages

```bash
npm install
```

2. Create PostgreSQL database

Database name example:

```text
speedy_sweeties
```

3. Copy env file

```bash
cp .env.example .env
```

Or create `.env` manually on Windows.

4. Generate Prisma client

```bash
npx prisma generate
```

5. Run migration

```bash
npx prisma migrate dev --name init
```

6. Start dev server

```bash
npm run dev
```

## Health check

```bash
curl http://localhost:4000/api/v1/health
```
