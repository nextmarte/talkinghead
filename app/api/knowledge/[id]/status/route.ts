import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// PATCH /api/knowledge/[id]/status - Atualiza status do documento (chamado pelo backend)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, chunkCount, errorMessage } = body;

    const knowledge = await prisma.knowledgeBase.update({
      where: { id },
      data: {
        status,
        ...(chunkCount !== undefined && { chunkCount }),
        ...(errorMessage !== undefined && { errorMessage }),
        ...(status === "COMPLETED" && { processedAt: new Date() }),
      },
    });

    return NextResponse.json(knowledge);
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
