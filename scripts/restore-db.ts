import { prisma } from '../lib/prisma';
import fs from 'fs';

// Função para converter strings de data de volta para objetos Date
function reviveDates(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => reviveDates(item));
  }

  for (const key in obj) {
    if (typeof obj[key] === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj[key])) {
      obj[key] = new Date(obj[key]);
    } else if (typeof obj[key] === 'object') {
      obj[key] = reviveDates(obj[key]);
    }
  }
  return obj;
}

async function restore() {
  const backupPath = './database_dump.json';
  
  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Arquivo de backup não encontrado: ${backupPath}`);
    return;
  }

  try {
    console.log('🚀 Iniciando restauração do banco de dados...');
    const rawData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    const data = reviveDates(rawData);

    // Limpar tabelas na ordem inversa de dependência
    console.log('🧹 Limpando dados existentes...');
    await prisma.$transaction([
      prisma.message.deleteMany(),
      prisma.conversation.deleteMany(),
      prisma.knowledgeBase.deleteMany(),
      prisma.agent.deleteMany(),
      prisma.session.deleteMany(),
      prisma.account.deleteMany(),
      prisma.verificationToken.deleteMany(),
      prisma.invitation.deleteMany(),
      prisma.user.deleteMany(),
    ]);

    console.log('📥 Importando dados...');

    // Restaurar na ordem correta de dependência
    if (data.users.length > 0) {
      console.log(`- Restaurando ${data.users.length} usuários...`);
      await prisma.user.createMany({ data: data.users });
    }

    if (data.invitations && data.invitations.length > 0) {
      console.log(`- Restaurando ${data.invitations.length} convites...`);
      await prisma.invitation.createMany({ data: data.invitations });
    }

    if (data.verificationTokens && data.verificationTokens.length > 0) {
      console.log(`- Restaurando ${data.verificationTokens.length} tokens...`);
      await prisma.verificationToken.createMany({ data: data.verificationTokens });
    }

    if (data.accounts && data.accounts.length > 0) {
      console.log(`- Restaurando ${data.accounts.length} contas...`);
      await prisma.account.createMany({ data: data.accounts });
    }

    if (data.sessions && data.sessions.length > 0) {
      console.log(`- Restaurando ${data.sessions.length} sessões...`);
      await prisma.session.createMany({ data: data.sessions });
    }

    if (data.agents && data.agents.length > 0) {
      console.log(`- Restaurando ${data.agents.length} agentes...`);
      await prisma.agent.createMany({ data: data.agents });
    }

    if (data.knowledgeBase && data.knowledgeBase.length > 0) {
      console.log(`- Restaurando ${data.knowledgeBase.length} itens da base de conhecimento...`);
      await prisma.knowledgeBase.createMany({ data: data.knowledgeBase });
    }

    if (data.conversations && data.conversations.length > 0) {
      console.log(`- Restaurando ${data.conversations.length} conversas...`);
      await prisma.conversation.createMany({ data: data.conversations });
    }

    if (data.messages && data.messages.length > 0) {
      console.log(`- Restaurando ${data.messages.length} mensagens (em chunks)...`);
      const chunkSize = 100;
      for (let i = 0; i < data.messages.length; i += chunkSize) {
        const chunk = data.messages.slice(i, i + chunkSize);
        await prisma.message.createMany({ data: chunk });
      }
    }

    console.log('✅ Restauração concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao restaurar banco de dados:', error);
  } finally {
    await prisma.$disconnect();
  }
}

restore();
