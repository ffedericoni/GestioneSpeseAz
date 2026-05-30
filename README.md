# Gestione Spese Aziendali

Sistema di gestione delle note spese aziendali. L'interfaccia utente è interamente in italiano; il codice e le API sono in inglese.

## Requisiti
- Node 20+ (sviluppato su Node 24)
- PostgreSQL in esecuzione su localhost:5432

## Setup
1. Copia il file di esempio e imposta le credenziali del database:
   `cp .env.example packages/server/.env`
   (poi modifica `DATABASE_URL`, `TEST_DATABASE_URL` e `SESSION_SECRET` in `packages/server/.env`).
2. Crea i due database PostgreSQL: `gestione_spese` e `gestione_spese_test`.
3. Installa le dipendenze: `npm install`
4. Applica le migration al database di sviluppo:
   `npm run prisma:migrate --workspace packages/server`
5. Applica le migration al database di test (dalla cartella `packages/server`):
   `DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy`
6. Crea il primo amministratore:
   `npm run create:admin --workspace packages/server -- admin@azienda.it password123 "Anna Admin"`

## Avvio in sviluppo
- API (porta 3001): `npm run dev:server`
- Web (porta 5173): `npm run dev:web`

Apri http://localhost:5173 ed accedi con le credenziali dell'amministratore creato.

## Test
- Tutti i test unitari e di integrazione: `npm test`
- Solo server: `npm test --workspace packages/server`
- Solo web: `npm test --workspace packages/web`
- End-to-end (Playwright, avvia i server automaticamente): `npm run e2e --workspace packages/web`
  (la prima volta installa il browser: `npx playwright install chromium` dalla cartella `packages/web`)

## Struttura
- `packages/server` — API Node + Fastify + Prisma (PostgreSQL). Logica di dominio pura in `src/core/`.
- `packages/web` — applicazione React + Vite (interfaccia in italiano).
- `docs/superpowers/` — specifiche di design e piani di implementazione.

## Funzionalità (Slice 1)
- Autenticazione email + password con sessione (cookie cifrato).
- Ruoli: Dipendente, Responsabile, Amministrazione, Amministratore.
- Gestione utenti (solo Amministratore): creazione, elenco, modifica ruolo/responsabile, attivazione/disattivazione.
