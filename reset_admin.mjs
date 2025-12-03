import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const hash = await bcrypt.hash('admin123', 12);
const user = await prisma.user.update({
  where: { email: 'admin@admin.com' },
  data: { password: hash, role: 'ADMIN' }
});
console.log('Senha resetada! Email:', user.email, 'Role:', user.role);
await prisma.$disconnect();
