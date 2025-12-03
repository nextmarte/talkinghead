import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// GET /api/agents - Lista agentes ativos (público) ou todos (admin)
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const isAdmin = session?.user?.role === "ADMIN";
    
    const agents = await prisma.agent.findMany({
      where: isAdmin ? {} : { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        avatar: true,
        isActive: true,
        isDefault: true,
        createdAt: true,
        _count: {
          select: {
            conversations: true,
            knowledgeBase: true,
          },
        },
      },
      orderBy: [
        { isDefault: "desc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(agents);
  } catch (error) {
    console.error("Erro ao listar agentes:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// POST /api/agents - Cria novo agente (admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const body = await req.json();
    const { name, description, systemPrompt, avatar, voiceSample, isDefault, voiceGender, voicePitch, voiceSpeed } = body;

    if (!name || !systemPrompt) {
      return NextResponse.json(
        { error: "Nome e prompt são obrigatórios" },
        { status: 400 }
      );
    }

    // Se marcando como default, desmarca outros
    if (isDefault) {
      await prisma.agent.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const agent = await prisma.agent.create({
      data: {
        name,
        description,
        systemPrompt,
        avatar,
        voiceSample,
        voiceGender: voiceGender || "neutral",
        voicePitch: voicePitch || 1.0,
        voiceSpeed: voiceSpeed || 1.0,
        isDefault: isDefault || false,
        createdById: session.user.id!,
      },
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar agente:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
