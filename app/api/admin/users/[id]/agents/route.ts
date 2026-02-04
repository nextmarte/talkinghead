import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// GET - Listar agentes com status de acesso para um usuário
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id: userId } = await params;

    // Verificar se o usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Buscar todos os agentes ativos
    const agents = await prisma.agent.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        avatar: true,
        isPublic: true,
        isDefault: true,
      },
      orderBy: { name: "asc" },
    });

    // Buscar acessos do usuário
    const userAccess = await prisma.userAgentAccess.findMany({
      where: { userId },
      select: { agentId: true },
    });

    const accessSet = new Set(userAccess.map((a) => a.agentId));

    // Combinar dados
    const agentsWithAccess = agents.map((agent) => ({
      ...agent,
      hasAccess: agent.isPublic || accessSet.has(agent.id),
      isExplicitAccess: accessSet.has(agent.id),
    }));

    return NextResponse.json({
      user,
      agents: agentsWithAccess,
    });
  } catch (error) {
    console.error("Erro ao buscar agentes do usuário:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// PUT - Atualizar acessos de um usuário
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id: userId } = await params;
    const { agentIds } = await request.json();

    if (!Array.isArray(agentIds)) {
      return NextResponse.json({ error: "agentIds deve ser um array" }, { status: 400 });
    }

    // Verificar se o usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Transação: remover acessos antigos e adicionar novos
    await prisma.$transaction(async (tx) => {
      // Remover todos os acessos existentes
      await tx.userAgentAccess.deleteMany({
        where: { userId },
      });

      // Adicionar novos acessos (apenas para agentes privados)
      if (agentIds.length > 0) {
        // Verificar quais agentes são privados
        const privateAgents = await tx.agent.findMany({
          where: {
            id: { in: agentIds },
            isPublic: false,
          },
          select: { id: true },
        });

        const privateAgentIds = privateAgents.map((a) => a.id);

        if (privateAgentIds.length > 0) {
          await tx.userAgentAccess.createMany({
            data: privateAgentIds.map((agentId) => ({
              userId,
              agentId,
              grantedBy: session.user.id,
            })),
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao atualizar acessos:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
