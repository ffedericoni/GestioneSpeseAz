import "../loadEnv.js";
import { prisma } from "../db.js";
import { hashPassword } from "../auth/password.js";

async function main(): Promise<void> {
  const [email, password, ...nameParts] = process.argv.slice(2);
  const fullName = nameParts.join(" ");
  if (!email || !password || !fullName) {
    console.error('Usage: npm run create:admin -- <email> <password> "<Full Name>"');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`User ${email} already exists`);
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      fullName,
      role: "ADMIN",
    },
  });
  console.log(`Created ADMIN ${user.email} (${user.id})`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
