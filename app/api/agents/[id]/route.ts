import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// GET /api/agents/[id] - Busca agente por ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        knowledgeBase: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            fileType: true,
            status: true,
            chunkCount: true,
            createdAt: true,
            processedAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            conversations: true,
          },
        },
      },
    });

    if (!agent) {
      return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
    }

    return NextResponse.json(agent);
  } catch (error) {
    console.error("Erro ao buscar agente:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// PUT /api/agents/[id] - Atualiza agente (admin only)
export async function PUT(
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

    const { id } = await params;
    const body = await req.json();
    const { name, description, systemPrompt, avatar, voiceSample, isActive, isDefault, voiceGender, voicePitch, voiceSpeed, useElevenLabs, elevenLabsVoiceId } = body;

    // Verifica se agente existe
    const existing = await prisma.agent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Agente não encontrado" }, { status: 404 });
    }

    // Valida Voice ID se ElevenLabs está habilitado
    if (useElevenLabs && !elevenLabsVoiceId?.trim()) {
      return NextResponse.json(
        { error: "Voice ID é obrigatório quando ElevenLabs está habilitado" },
        { status: 400 }
      );
    }

    // Se marcando como default, desmarca outros
    if (isDefault && !existing.isDefault) {
      await prisma.agent.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const agent = await prisma.agent.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(systemPrompt && { systemPrompt }),
        ...(avatar !== undefined && { avatar }),
        ...(voiceSample !== undefined && { voiceSample }),
        ...(isActive !== undefined && { isActive }),
        ...(isDefault !== undefined && { isDefault }),
        ...(voiceGender !== undefined && { voiceGender }),
        ...(voicePitch !== undefined && { voicePitch }),
        ...(voiceSpeed !== undefined && { voiceSpeed }),
        ...(useElevenLabs !== undefined && { useElevenLabs }),
        ...(useElevenLabs !== undefined && {
          elevenLabsVoiceId: useElevenLabs ? elevenLabsVoiceId?.trim() : null,
        }),
      },
    });

    return NextResponse.json(agent);
  } catch (error) {
    console.error("Erro ao atualizar agente:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// DELETE /api/agents/[id] - Remove agente (admin only)
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

    const { id } = await params;

    // Deleta agente (cascade deleta knowledge base)
    await prisma.agent.delete({ where: { id } });

    // TODO: Deletar collection do ChromaDB via backend
    // await fetch(`${BACKEND_URL}/api/agents/${id}/knowledge`, { method: 'DELETE' });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao deletar agente:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
