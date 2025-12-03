import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8583";

// POST /api/agents/[id]/knowledge/[knowledgeId]/process - Reprocessar documento
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; knowledgeId: string }> }
) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { id: agentId, knowledgeId } = await params;

    // Busca documento
    const knowledge = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeId },
    });

    if (!knowledge) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
    }

    if (knowledge.agentId !== agentId) {
      return NextResponse.json({ error: "Documento não pertence a este agente" }, { status: 403 });
    }

    // Atualiza status para PROCESSING
    await prisma.knowledgeBase.update({
      where: { id: knowledgeId },
      data: { status: "PROCESSING" },
    });

    // Dispara vetorização no backend
    const response = await fetch(`${BACKEND_URL}/api/knowledge/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        knowledge_id: knowledge.id,
        agent_id: agentId,
        file_path: knowledge.fileUrl,
        file_name: knowledge.fileName,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.detail || "Erro ao processar" },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: "processing" });
  } catch (error) {
    console.error("Erro ao processar documento:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
