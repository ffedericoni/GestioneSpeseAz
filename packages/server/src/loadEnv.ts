// Loads packages/server/.env into process.env when present.
// Under every npm workspace script (dev/start/test) the cwd is the server
// package directory, so process.loadEnvFile() (Node 20.12+) finds ./.env.
// Imported first by the server entrypoint and used as a Vitest setup file, so
// DATABASE_URL / TEST_DATABASE_URL / SESSION_SECRET are available before the
// Prisma client or session plugin read them.
try {
  process.loadEnvFile();
} catch {
  // .env is optional; the vars may already be provided by the environment.
}
