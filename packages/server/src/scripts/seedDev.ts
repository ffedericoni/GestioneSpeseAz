import "../loadEnv.js";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";
import type { Role } from "@gsa/shared";

async function upsertUser(opts: {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  managerEmail?: string;
}): Promise<string> {
  const managerId = opts.managerEmail
    ? (await prisma.user.findUnique({ where: { email: opts.managerEmail } }))?.id ?? null
    : null;
  const passwordHash = await hashPassword(opts.password);
  const user = await prisma.user.upsert({
    where: { email: opts.email },
    update: { fullName: opts.fullName, role: opts.role, managerId, active: true },
    create: {
      email: opts.email,
      passwordHash,
      fullName: opts.fullName,
      role: opts.role,
      managerId,
    },
  });
  return user.id;
}

async function main(): Promise<void> {
  await upsertUser({
    email: "admin@azienda.it",
    password: "password123",
    fullName: "Anna Admin",
    role: "ADMIN",
  });
  await upsertUser({
    email: "responsabile@azienda.it",
    password: "password123",
    fullName: "Marco Responsabile",
    role: "MANAGER",
  });
  await upsertUser({
    email: "dipendente@azienda.it",
    password: "password123",
    fullName: "Elsa Dipendente",
    role: "EMPLOYEE",
    managerEmail: "responsabile@azienda.it",
  });
  // eslint-disable-next-line no-console
  console.log("Seeded dev users: admin@/responsabile@/dipendente@azienda.it (password123)");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
