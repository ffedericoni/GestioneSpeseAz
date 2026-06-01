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
- `packages/shared` — `@gsa/shared`: dominio puro condiviso da server e web (ruoli, stati, categorie e la macchina a stati delle note spese). È l'unica fonte di verità per le transizioni. Viene compilato automaticamente da `npm install` (script `prepare`), quindi non richiede passaggi manuali.
- `packages/server` — API Node + Fastify + Prisma (PostgreSQL). Tutte le rotte applicative sono sotto `/api/*`. Logica di dominio pura in `src/core/` e in `@gsa/shared`.
- `packages/web` — applicazione React + Vite (interfaccia in italiano).
- `docs/superpowers/` — specifiche di design e piani di implementazione.

## Funzionalità (Slice 1)
- Autenticazione email + password con sessione (cookie cifrato).
- Ruoli: Dipendente, Responsabile, Amministrazione, Amministratore.
- Gestione utenti (solo Amministratore): creazione (con ruolo e responsabile), elenco, attivazione/disattivazione. La modifica di ruolo/responsabile di un utente esistente è supportata dall'API (`PATCH /users/:id`) ma non ancora dall'interfaccia web.

## Funzionalità (Slice 2)
- **Note spese e macchina a stati.** Un dipendente crea una nota spese, vi aggiunge le voci di spesa e la invia per approvazione; il responsabile la **approva**, la **respinge** oppure ne **richiede la revisione** (con motivazione). Stati: Bozza → Da approvare → In revisione / Approvata / Respinta → Inviata al pagamento → Pagata (i passaggi al pagamento sono gestiti dall'Amministrazione — vedi Slice 4).
- **Categorie supportate in questa slice:** Vitto e alloggio, Trasporti, Altro. Ogni voce ha importo in centesimi interi e IVA opzionale.
- **API sotto `/api/*`.** Tutte le rotte applicative (login, utenti, note spese) sono ora servite sotto il prefisso `/api`, eliminando la collisione tra il proxy di Vite e le rotte SPA.
- **Sicurezza login:** confronto password a tempo costante anche per email inesistenti (hash fittizio) e rate limit sui tentativi di accesso.
- **Coda approvazioni** per il responsabile: elenca solo le note spese dei propri collaboratori in attesa di approvazione (Amministrazione/Amministratore vedono tutte).
- **Macchina a stati condivisa:** server (che applica le regole) e web (che mostra i pulsanti disponibili) derivano entrambi dalle stesse transizioni in `@gsa/shared`; nessuna regola è duplicata.
- **Permessi e modifica:** l'autorizzazione è sempre applicata lato server su ogni rotta; il dipendente può modificare la nota e le voci finché non è stata approvata o respinta.

### Dati di esempio per lo sviluppo
`npm run seed:dev --workspace packages/server` crea (in modo idempotente) tre utenti di prova, tutti con password `password123`:
- `admin@azienda.it` (Amministratore)
- `responsabile@azienda.it` (Responsabile)
- `dipendente@azienda.it` (Dipendente, collaboratore del responsabile)

Sono usati anche dal test end-to-end.

## Funzionalità (Slice 3a — fondamenta rimborso chilometrico)

- **Tabelle ACI (Admin):** importazione delle tariffe €/km da file CSV normalizzato
  (intestazione `year,make,model,fuel,variant,costPerKm`, separatore decimale `.`).
  L'import è atomico: se una riga è errata, nulla viene salvato e vengono mostrati
  gli errori riga per riga. Re-importare lo stesso anno aggiorna le righe esistenti
  (upsert) preservando i collegamenti dei veicoli.
- **Veicoli (Dipendente):** registrazione dei propri veicoli, ciascuno collegato a
  una tariffa ACI scelta tramite ricerca per marca/modello; attivazione/disattivazione.
- **Impostazioni (Admin):** tolleranza chilometrica configurabile (default 10%).

### Note per lo sviluppo

- Utenti di prova (`npm run seed:dev --workspace packages/server`): `admin@azienda.it`,
  `responsabile@azienda.it`, `dipendente@azienda.it` (password `password123`).
- Esempio CSV ACI:
  ```csv
  year,make,model,fuel,variant,costPerKm
  2026,Fiat,Panda,Benzina,1.2,0.6543
  ```

## Funzionalità (Slice 3b — rimborso chilometrico)

- **Voce di rimborso chilometrico** nelle note spese: l'utente sceglie un veicolo
  (collegato a una tariffa ACI), inserisce partenza, arrivo, andata/ritorno e la
  distanza stimata, poi preme **Calcola** per vedere l'intervallo consentito
  (`baseline` → `baseline × (1 + tolleranza)`) e la tariffa €/km.
- Inserisce i **km percorsi**: oltre il limite superiore è obbligatoria una
  **giustificazione**; la voce viene contrassegnata per il responsabile.
- L'importo è calcolato dal server (`km × €/km`, arrotondato ai centesimi) e tutti
  i valori (tariffa, tolleranza, km, percorso) sono **congelati** sulla voce, così
  le note spese restano verificabili anche se le tabelle ACI o la tolleranza
  cambiano in seguito.
- Il calcolo della distanza è dietro un *port* `DistanceProvider`; oggi è manuale
  (`ManualDistanceProvider`), pronto per un provider di routing reale in futuro.

### Note per lo sviluppo (Slice 3b)

- Core puro in `@gsa/shared/src/mileage.ts`; ricostruire con
  `npm run build --workspace packages/shared` dopo le modifiche.
- Endpoint preventivo: `POST /api/items/mileage/quote`.
- Non ancora implementato: la **modifica** di una voce `MILEAGE` (PATCH) — per
  correggere una voce la si elimina e reinserisce; il calcolo della distanza
  reale (routing/geocoding), i viaggi multi-tappa e l'OCR restano fuori ambito.

## Funzionalità (Slice 4 — pagamento ed esportazione)

- **Coda pagamenti (Amministrazione).** La pagina **Pagamenti** elenca, tra tutti
  i dipendenti, le note spese Approvate, Inviate al pagamento e Pagate. Da qui
  l'Amministrazione **invia al pagamento** una nota approvata e poi la **segna
  come pagata**, registrando la **data di pagamento** (preimpostata a oggi,
  modificabile) e un **riferimento** facoltativo (es. numero del bonifico).
- **Transizioni Finance.** `POST /api/reports/:id/send-payment`
  (Approvata → Inviata al pagamento) e `POST /api/reports/:id/mark-paid`
  (Inviata al pagamento → Pagata). Sono riservate ai ruoli Amministrazione e
  Amministratore; le stesse azioni sono disponibili anche dalla pagina di
  dettaglio della nota spese.
- **Esportazione CSV per la contabilità.** Due esportazioni, entrambe riservate
  all'Amministrazione e filtrabili per stato:
  - `GET /api/reports/export/reports.csv` — una riga per nota spese (dipendente,
    titolo, stato, totale, date, riferimento pagamento, numero di voci).
  - `GET /api/reports/export/items.csv` — una riga per singola voce di spesa
    (compresi i dettagli del rimborso chilometrico).
  Il formato è pensato per Excel italiano: separatore `;`, virgola decimale,
  prefisso BOM UTF-8, fine riga CRLF, intestazioni in italiano. Il download
  avviene tramite un normale link `<a download>`, così il cookie di sessione
  accompagna la richiesta.

### Note per lo sviluppo (Slice 4)

- Nessuna migration: le colonne `paidAt` e `paymentReference` su `ExpenseReport`
  esistono già dalla Slice 2. Le transizioni `send-payment` e `mark-paid` erano
  già definite in `@gsa/shared`; la Slice 4 le espone soltanto.
- Costruttore CSV puro e testato in `packages/server/src/payment/csv.ts`
  (importi in centesimi → stringa con virgola decimale, nessun simbolo €).
- La coda pagamenti usa `GET /api/reports?scope=payments` (solo Amministrazione).
- Il test end-to-end (`packages/web/e2e/payment.spec.ts`) copre il percorso
  completo: invio → approvazione → invio al pagamento → pagamento con
  riferimento → verifica del link di esportazione.
- Utente di prova Amministrazione: `amministrazione@azienda.it`
  (password `password123`), creato da `npm run seed:dev --workspace packages/server`.
