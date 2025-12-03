import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const addMessageSchema = z.object({
  role: z.enum(["USER", "ASSISTANT", "SYSTEM"]),
  content: z.string().min(1),
  audioUrl: z.string().optional(),
  sttLatencyMs: z.number().optional(),
  llmLatencyMs: z.number().optional(),
  ttsLatencyMs: z.number().optional(),
  totalLatencyMs: z.number().optional(),
});

// GET /api/conversations/[id] - Busca conversa com mensagens
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    return NextResponse.json(conversation);
  } catch (error) {
    console.error("Erro ao buscar conversa:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST /api/conversations/[id] - Adiciona mensagem à conversa
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = addMessageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    // Verifica se a conversa pertence ao usuário
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    // Cria mensagem
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        role: parsed.data.role,
        content: parsed.data.content,
        audioUrl: parsed.data.audioUrl,
        sttLatencyMs: parsed.data.sttLatencyMs,
        llmLatencyMs: parsed.data.llmLatencyMs,
        ttsLatencyMs: parsed.data.ttsLatencyMs,
        totalLatencyMs: parsed.data.totalLatencyMs,
      },
    });

    // Atualiza título da conversa se for a primeira mensagem do usuário
    if (parsed.data.role === "USER" && !conversation.title) {
      const title = parsed.data.content.slice(0, 50) + (parsed.data.content.length > 50 ? "..." : "");
      await prisma.conversation.update({
        where: { id },
        data: { title },
      });
    }

    // Atualiza updatedAt da conversa
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Erro ao adicionar mensagem:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// DELETE /api/conversations/[id] - Deleta conversa
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;

    // Verifica se a conversa pertence ao usuário
    const conversation = await prisma.conversation.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
    }

    // Deleta conversa (cascade deleta mensagens)
    await prisma.conversation.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Conversa deletada" });
  } catch (error) {
    console.error("Erro ao deletar conversa:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
