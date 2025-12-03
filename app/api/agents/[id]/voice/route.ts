import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

// Diretório de uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/home/marcus/talkinghead/backend/data/uploads";

// POST /api/agents/[id]/voice - Upload de sample de voz para clonagem
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

    // Valida tipo de áudio
    const allowedTypes = ["audio/wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/webm"];
    const allowedExtensions = [".wav", ".mp3", ".ogg", ".webm"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(ext)) {
      return NextResponse.json(
        { error: "Tipo de arquivo não suportado. Use: WAV, MP3, OGG ou WebM" },
        { status: 400 }
      );
    }

    // Limite de tamanho (10MB - suficiente para ~1 minuto de áudio)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Áudio muito grande. Máximo: 10MB (~1 minuto recomendado)" },
        { status: 400 }
      );
    }

    // Cria diretório de voices
    const voicesDir = join(UPLOAD_DIR, "voices");
    if (!existsSync(voicesDir)) {
      await mkdir(voicesDir, { recursive: true });
    }

    // Remove sample antigo se existir
    if (agent.voiceSample) {
      try {
        const oldPath = join(UPLOAD_DIR, agent.voiceSample.replace("/uploads/", ""));
        if (existsSync(oldPath)) {
          await unlink(oldPath);
        }
      } catch (e) {
        console.warn("Erro ao remover sample antigo:", e);
      }
    }

    // Salva novo sample (preferência por WAV para melhor qualidade de clonagem)
    const fileExt = ext || ".wav";
    const fileName = `${agentId}${fileExt}`;
    const filePath = join(voicesDir, fileName);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    // URL pública do sample
    const voiceUrl = `/uploads/voices/${fileName}`;

    // Atualiza no banco
    await prisma.agent.update({
      where: { id: agentId },
      data: { voiceSample: voiceUrl },
    });

    return NextResponse.json({ 
      voiceSample: voiceUrl,
      message: "Sample de voz enviado. Recomenda-se 10-30 segundos de fala clara para melhor clonagem."
    });
  } catch (error) {
    console.error("Erro ao fazer upload de voice:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// DELETE /api/agents/[id]/voice - Remove sample de voz
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
    if (agent.voiceSample) {
      try {
        const filePath = join(UPLOAD_DIR, agent.voiceSample.replace("/uploads/", ""));
        if (existsSync(filePath)) {
          await unlink(filePath);
        }
      } catch (e) {
        console.warn("Erro ao remover voice sample:", e);
      }
    }

    // Atualiza no banco
    await prisma.agent.update({
      where: { id: agentId },
      data: { voiceSample: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao remover voice sample:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
