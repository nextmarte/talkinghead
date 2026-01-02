# Guia de Backup e Restauração - TalkingHead AI

Este guia explica como realizar o backup dos dados da sua instalação atual e restaurá-los em uma nova VPS.

## 📤 Passo 1: Realizando o Backup (Na máquina atual)

1. Certifique-se de que o banco de dados está rodando.
2. Execute o script de backup usando Bun (ou npx tsx):
   ```bash
   bun scripts/backup-db.ts
   ```
3. Isso gerará um arquivo chamado `database_dump.json` na raiz do projeto.
4. **Importante:** Este arquivo contém dados sensíveis (hashes de senhas, tokens). Mantenha-o seguro.

## 🚚 Passo 2: Transferindo os dados

Transfira o arquivo `database_dump.json` para a nova VPS usando `scp` ou similar:
```bash
scp database_dump.json usuario@sua-vps:/caminho/para/talkinghead/
```

## 📥 Passo 3: Restaurando os dados (Na nova VPS)

1. Na nova VPS, certifique-se de que o projeto está instalado e o banco de dados PostgreSQL está rodando.
2. Execute as migrações do Prisma para garantir que o schema está atualizado:
   ```bash
   npx prisma migrate deploy
   ```
3. Execute o script de restauração:
   ```bash
   bun scripts/restore-db.ts
   ```
4. O script irá limpar o banco de dados atual e importar todos os dados do arquivo JSON.

---

## ⚠️ Observações Importantes

### 1. Arquivos de Mídia e Conhecimento
Este backup cobre apenas o **banco de dados**. Os arquivos físicos (PDFs de conhecimento, áudios gravados, avatares) precisam ser transferidos manualmente:
- Pasta de uploads: `backend/data/uploads/`
- Banco vetorial (ChromaDB): `backend/data/chroma/`

Recomendamos zipar essas pastas e transferi-las:
```bash
# Na máquina antiga
tar -czvf media_backup.tar.gz backend/data/uploads backend/data/chroma

# Na nova VPS
tar -xzvf media_backup.tar.gz
```

### 2. Variáveis de Ambiente
Certifique-se de que o arquivo `.env` na nova VPS tenha as mesmas chaves secretas (`AUTH_SECRET`, etc) se você quiser que as sessões e cookies antigos continuem válidos (embora a restauração limpe as sessões ativas por segurança).

### 3. Ordem de Execução
Sempre execute o `prisma migrate deploy` **antes** de rodar o script de restauração para garantir que as tabelas existam.
