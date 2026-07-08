/**
 * Seed the super-admin operator account and their organization.
 * Idempotent: safe to run multiple times.
 */
import { PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPERADMIN_EMAIL || "admin@aivoiceos.local";
  const password = process.env.SUPERADMIN_PASSWORD || "Admin12345!";
  const orgName = process.env.SUPERADMIN_ORG || "AI Voice OS";

  const org = await prisma.organization.upsert({
    where: { id: "org_root" },
    update: { name: orgName },
    create: { id: "org_root", name: orgName },
  });

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: { organizationId: org.id, role: Role.super_admin },
    create: {
      organizationId: org.id,
      email,
      name: "Platform Admin",
      passwordHash,
      role: Role.super_admin,
    },
  });

  console.log(`Seeded super-admin: ${email} (org: ${org.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
