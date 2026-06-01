#!/bin/sh
set -e

# Apply any pending migrations before the server starts.
# Uses DATABASE_URL from the environment (injected by Cloud Run).
node_modules/.bin/prisma migrate deploy --schema=packages/server/prisma/schema.prisma

exec node packages/server/dist/src/server.js
