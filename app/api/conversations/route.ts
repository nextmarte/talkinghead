import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { z } from "zod";

const createConversationSchema = z.object({
  mode: z.enum(["PUSH_TO_TALK", "LIVE_CALL"]).default("PUSH_TO_TALK"),
  title: z.string().optional(),
});

// GET /api/conversations - Lista conversas (admin vê todas, usuário vê as suas)
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const isAdmin = session.user.role === "ADMIN";
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    const conversations = await prisma.conversation.findMany({
      where: isAdmin ? {} : { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: isAdmin ? {
          select: { id: true, name: true, email: true }
        } : false,
        agent: {
          select: { id: true, name: true, avatar: true }
        },
        _count: { select: { messages: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { content: true, createdAt: true },
        },
      },
    });

    // Se admin, também retorna total para paginação
    if (isAdmin) {
      const total = await prisma.conversation.count();
      return NextResponse.json({ conversations, total, limit, offset });
    }

    return NextResponse.json(conversations);
  } catch (error) {
    console.error("Erro ao listar conversas:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST /api/conversations - Cria nova conversa
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = createConversationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const conversation = await prisma.conversation.create({
      data: {
        userId: session.user.id,
        mode: parsed.data.mode,
        title: parsed.data.title,
      },
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar conversa:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
