import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
// npx tsx scripts/create-admin.ts                                                     
const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("kf123", 10);
  
  const admin = await prisma.user.upsert({
    where: { phone: "44150151" },
    update: {},
    create: {
      phone: "44150151",
      email: "kf@gmail.com",
      password: hashedPassword,
      nom: "Administrateur",
      role: "ADMIN",
    },
  });
  
  console.log("✅ Admin créé:", admin.phone);
  console.log("📝 Mot de passe: kf123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());