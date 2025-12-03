const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('admin123', 12);
  const user = await prisma.user.update({
    where: { email: 'admin@admin.com' },
    data: { password: hash, role: 'ADMIN' }
  });
  console.log('Senha resetada! Email:', user.email, 'Role:', user.role);
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
