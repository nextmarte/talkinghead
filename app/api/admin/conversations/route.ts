import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// GET /api/admin/conversations - Lista conversas com paginação e filtros
export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const search = searchParams.get("search")?.trim() || "";
    const agentId = searchParams.get("agentId")?.trim() || "";
    const mode = searchParams.get("mode")?.trim() || "";

    // Construir where clause dinamicamente
    const where: any = {};

    if (search) {
      where.OR = [
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { title: { contains: search, mode: "insensitive" } },
      ];
    }

    if (agentId) {
      where.agentId = agentId === "null" ? null : agentId;
    }

    if (mode && (mode === "LIVE_CALL" || mode === "PUSH_TO_TALK")) {
      where.mode = mode;
    }

    // Contar total
    const total = await prisma.conversation.count({ where });

    // Buscar dados
    const conversations = await prisma.conversation.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        agent: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
    });

    const response: PaginatedResponse<typeof conversations[0]> = {
      data: conversations,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Erro ao listar conversas:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
