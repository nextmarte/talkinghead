import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { unlink } from "fs/promises";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8583";

// PATCH /api/agents/[id]/knowledge/[knowledgeId] - Atualiza status do documento
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; knowledgeId: string }> }
) {
  try {
    const { id: agentId, knowledgeId } = await params;
    const body = await req.json();
    const { status, chunkCount, errorMessage } = body;

    // Busca documento
    const knowledge = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeId },
    });

    if (!knowledge || knowledge.agentId !== agentId) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
    }

    // Atualiza status e metadados
    const updated = await prisma.knowledgeBase.update({
      where: { id: knowledgeId },
      data: {
        status,
        ...(chunkCount && { chunkCount }),
        ...(errorMessage && { errorMessage }),
        ...(status === "COMPLETED" && { processedAt: new Date() }),
      },
    });

    console.log(`✅ Status atualizado: ${knowledgeId} → ${status}`);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// DELETE /api/agents/[id]/knowledge/[knowledgeId] - Remove documento
export async function DELETE(
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

    if (!knowledge || knowledge.agentId !== agentId) {
      return NextResponse.json({ error: "Documento não encontrado" }, { status: 404 });
    }

    // Remove arquivo físico
    try {
      await unlink(knowledge.fileUrl);
    } catch (e) {
      console.warn("Arquivo não encontrado para deletar:", knowledge.fileUrl);
    }

    // Remove do ChromaDB via backend
    try {
      await fetch(`${BACKEND_URL}/api/knowledge/${knowledgeId}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.warn("Erro ao remover do ChromaDB:", e);
    }

    // Remove do banco
    await prisma.knowledgeBase.delete({ where: { id: knowledgeId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao deletar documento:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
