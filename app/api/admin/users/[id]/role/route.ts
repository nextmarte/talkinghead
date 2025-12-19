import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

// PATCH /api/admin/users/[id]/role - Altera o role do usuário
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Verifica se é admin
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { role } = body;

    // Valida role
    if (!["USER", "ADMIN"].includes(role)) {
      return NextResponse.json(
        { error: "Role inválido. Deve ser USER ou ADMIN" },
        { status: 400 }
      );
    }

    // Verifica se usuário existe
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    // Admin não pode alterar seu próprio role
    if (user.id === session.user.id) {
      return NextResponse.json(
        { error: "Não pode alterar seu próprio role" },
        { status: 403 }
      );
    }

    // Atualiza o role
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        role: role as "USER" | "ADMIN",
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    return NextResponse.json(
      {
        message: `Usuário promovido para ${role}`,
        user: updatedUser,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao alterar role:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
