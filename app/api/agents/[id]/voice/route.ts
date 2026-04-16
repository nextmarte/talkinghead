import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import OpenAI from "openai";
import { createReadStream } from "fs";

// Diretório de uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/home/marcus/talkinghead/backend/data/uploads";

// Cliente OpenAI para transcrição
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Transcreve áudio usando a API do Whisper da OpenAI.
 * Isso é usado para obter o texto de referência para melhor voice cloning.
 */
async function transcribeAudio(audioPath: string): Promise<string> {
  try {
    console.log(`🎙️ Transcrevendo áudio: ${audioPath}`);
    
    const response = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: createReadStream(audioPath),
      language: "pt",
    });
    
    const text = response.text?.trim() || "";
    console.log(`✅ Transcrição: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
    return text;
  } catch (error) {
    console.error("⚠️ Erro ao transcrever áudio:", error);
    return "";
  }
}

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

    // Salva novo sample (preferência por WAV para melhor qualidade de clonagem)
    const fileExt = ext || ".wav";
    const fileName = `${agentId}${fileExt}`;
    const filePath = join(voicesDir, fileName);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));
    console.log(`✅ Arquivo de áudio salvo: ${filePath}`);

    // Remove arquivo antigo SOMENTE APÓS salvar o novo (só se for extensão diferente)
    if (agent.voiceSample) {
      try {
        const oldPath = join(UPLOAD_DIR, agent.voiceSample.replace("/uploads/", ""));
        // Só delete se for arquivo diferente (extensão diferente)
        if (existsSync(oldPath) && oldPath !== filePath) {
          await unlink(oldPath);
          console.log(`🗑️ Arquivo antigo removido: ${oldPath}`);
        }
      } catch (e) {
        console.warn("Erro ao remover arquivo antigo:", e);
      }
    }

    // Remove arquivo preparado e transcrição antiga (sempre remove para recalcular)
    try {
      const preparedPath = join(voicesDir, `${agentId}_prepared.wav`);
      const refTextPath = join(voicesDir, `${agentId}_ref.txt`);
      if (existsSync(preparedPath)) {
        await unlink(preparedPath);
        console.log(`🗑️ Arquivo preparado anterior removido: ${preparedPath}`);
      }
      if (existsSync(refTextPath)) {
        await unlink(refTextPath);
        console.log(`🗑️ Transcrição anterior removida: ${refTextPath}`);
      }
    } catch (e) {
      console.warn("Erro ao remover arquivos temporários:", e);
    }

    // Transcreve o áudio para obter texto de referência (melhora voice cloning)
    const refText = await transcribeAudio(filePath);
    
    // Salva transcrição em arquivo de texto
    if (refText) {
      const refTextPath = join(voicesDir, `${agentId}_ref.txt`);
      await writeFile(refTextPath, refText);
      console.log(`✅ Texto de referência salvo: ${refTextPath}`);
    }

    // Invalida cache do TTS no backend (para recarregar a nova voz)
    try {
      const backendUrl = process.env.BACKEND_URL || "http://localhost:8583";
      await fetch(`${backendUrl}/tts/cache/invalidate/${agentId}`, { method: "POST" });
      console.log(`🔄 Cache TTS invalidado para: ${agentId}`);
    } catch (e) {
      console.warn("Aviso: Não foi possível invalidar cache do TTS:", e);
    }

    // URL pública do sample
    const voiceUrl = `/uploads/voices/${fileName}`;

    // Atualiza no banco
    await prisma.agent.update({
      where: { id: agentId },
      data: { voiceSample: voiceUrl },
    });

    return NextResponse.json({ 
      voiceSample: voiceUrl,
      transcription: refText || undefined,
      message: refText 
        ? "Sample de voz enviado e transcrito com sucesso! Voice cloning otimizado."
        : "Sample de voz enviado. Transcrição falhou, usando modo x_vector_only."
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
        // Remove também arquivo preparado e transcrição
        const voicesDir = join(UPLOAD_DIR, "voices");
        const preparedPath = join(voicesDir, `${agentId}_prepared.wav`);
        const refTextPath = join(voicesDir, `${agentId}_ref.txt`);
        if (existsSync(preparedPath)) await unlink(preparedPath);
        if (existsSync(refTextPath)) await unlink(refTextPath);
      } catch (e) {
        console.warn("Erro ao remover voice sample:", e);
      }
    }

    // Invalida cache do TTS no backend
    try {
      const backendUrl = process.env.BACKEND_URL || "http://localhost:8583";
      await fetch(`${backendUrl}/tts/cache/invalidate/${agentId}`, { method: "POST" });
    } catch (e) {
      console.warn("Aviso: Não foi possível invalidar cache do TTS:", e);
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
