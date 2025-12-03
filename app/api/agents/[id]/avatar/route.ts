import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

// Diretório de uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/home/marcus/talkinghead/backend/data/uploads";

// POST /api/agents/[id]/avatar - Upload de avatar do agente
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { id: agentId } = await params;

    // Verifica se agente existe
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
    }

    // Parse do form data
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 400 });
    }

    // Valida tipo de imagem
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de arquivo não suportado. Use: JPEG, PNG, WebP ou GIF" },
        { status: 400 }
      );
    }

    // Limite de tamanho (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Imagem muito grande. Máximo: 5MB" },
        { status: 400 }
      );
    }

    // Cria diretório de avatars
    const avatarsDir = join(UPLOAD_DIR, "avatars");
    if (!existsSync(avatarsDir)) {
      await mkdir(avatarsDir, { recursive: true });
    }

    // Remove avatar antigo se existir
    if (agent.avatar) {
      try {
        const oldPath = join(UPLOAD_DIR, agent.avatar.replace("/uploads/", ""));
        if (existsSync(oldPath)) {
          await unlink(oldPath);
        }
      } catch (e) {
        console.warn("Erro ao remover avatar antigo:", e);
      }
    }

    // Salva novo avatar
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${agentId}.${ext}`;
    const filePath = join(avatarsDir, fileName);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    // URL pública do avatar
    const avatarUrl = `/uploads/avatars/${fileName}`;

    // Atualiza no banco
    await prisma.agent.update({
      where: { id: agentId },
      data: { avatar: avatarUrl },
    });

    return NextResponse.json({ avatar: avatarUrl });
  } catch (error) {
    console.error("Erro ao fazer upload de avatar:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// DELETE /api/agents/[id]/avatar - Remove avatar do agente
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { id: agentId } = await params;

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
    }

    // Remove arquivo físico
    if (agent.avatar) {
      try {
        const filePath = join(UPLOAD_DIR, agent.avatar.replace("/uploads/", ""));
        if (existsSync(filePath)) {
          await unlink(filePath);
        }
      } catch (e) {
        console.warn("Erro ao remover avatar:", e);
      }
    }

    // Atualiza no banco
    await prisma.agent.update({
      where: { id: agentId },
      data: { avatar: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao remover avatar:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
