import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// POST /api/admin/users/[id]/reset-password - Admin redefine a senha de um usuário
export async function POST(
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
    const { newPassword } = body;

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: "Senha deve ter pelo menos 6 caracteres" },
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

    // Admin não pode resetar a própria senha dessa forma
    if (user.id === session.user.id) {
      return NextResponse.json(
        { error: "Não pode resetar sua própria senha desta forma" },
        { status: 403 }
      );
    }

    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Atualiza senha e marca para forçar mudança na próxima vez
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
        forcePasswordChange: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        forcePasswordChange: true,
      },
    });

    return NextResponse.json(
      {
        message: "Senha resetada com sucesso",
        user: updatedUser,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao resetar senha:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
