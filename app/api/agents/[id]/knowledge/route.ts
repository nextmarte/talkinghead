import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

// Diretório de uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/home/marcus/talkinghead/backend/data/uploads";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8583";

// POST /api/agents/[id]/knowledge - Upload de documento para base de conhecimento
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

    // Valida extensão
    const allowedExtensions = [".pdf", ".txt", ".docx", ".doc", ".md", ".json"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return NextResponse.json(
        { error: `Extensão não suportada. Use: ${allowedExtensions.join(", ")}` },
        { status: 400 }
      );
    }

    // Limite de tamanho (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Arquivo muito grande. Máximo: 50MB" },
        { status: 400 }
      );
    }

    // Cria diretório do agente
    const agentDir = join(UPLOAD_DIR, "agents", agentId);
    if (!existsSync(agentDir)) {
      await mkdir(agentDir, { recursive: true });
    }

    // Salva arquivo com timestamp para evitar conflitos
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const fileName = `${timestamp}_${safeFileName}`;
    const filePath = join(agentDir, fileName);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    // Registra no banco
    const knowledge = await prisma.knowledgeBase.create({
      data: {
        agentId,
        fileName: file.name,
        fileUrl: filePath,
        fileSize: file.size,
        fileType: file.type || ext,
        status: "PENDING",
      },
    });

    // Dispara vetorização no backend (async)
    try {
      fetch(`${BACKEND_URL}/api/knowledge/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledge_id: knowledge.id,
          agent_id: agentId,
          file_path: filePath,
          file_name: file.name,
        }),
      }).catch((err) => console.error("Erro ao disparar vetorização:", err));
    } catch (e) {
      // Ignora erro - vetorização é assíncrona
    }

    return NextResponse.json(knowledge, { status: 201 });
  } catch (error) {
    console.error("Erro ao fazer upload:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// GET /api/agents/[id]/knowledge - Lista documentos do agente
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id: agentId } = await params;

    const documents = await prisma.knowledgeBase.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error("Erro ao listar documentos:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
