import { prisma } from '../lib/prisma';
import fs from 'fs';

async function backup() {
  try {
    console.log('🚀 Iniciando backup do banco de dados...');
    
    const data = {
      users: await prisma.user.findMany(),
      accounts: await prisma.account.findMany(),
      sessions: await prisma.session.findMany(),
      verificationTokens: await prisma.verificationToken.findMany(),
      agents: await prisma.agent.findMany(),
      knowledgeBase: await prisma.knowledgeBase.findMany(),
      conversations: await prisma.conversation.findMany(),
      messages: await prisma.message.findMany(),
      invitations: await prisma.invitation.findMany(),
      metadata: {
        exportedAt: new Date().toISOString(),
        version: '1.0'
      }
    };

    const backupPath = './database_dump.json';
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
    
    console.log(`✅ Backup concluído com sucesso!`);
    console.log(`📂 Arquivo salvo em: ${backupPath}`);
    console.log(`-----------------------------------`);
    console.log(`📊 Resumo do Backup:`);
    console.log(`- Usuários: ${data.users.length}`);
    console.log(`- Agentes: ${data.agents.length}`);
    console.log(`- Conversas: ${data.conversations.length}`);
    console.log(`- Mensagens: ${data.messages.length}`);
    console.log(`- Convites: ${data.invitations.length}`);
    console.log(`-----------------------------------`);
  } catch (error) {
    console.error('❌ Erro ao realizar backup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

backup();
