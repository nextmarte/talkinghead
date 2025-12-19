import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

// POST /api/user/change-password - Usuário troca sua própria senha
export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    // Validações
    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: "Nova senha deve ter pelo menos 6 caracteres" },
        { status: 400 }
      );
    }

    // Busca usuário
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado" },
        { status: 404 }
      );
    }

    // Se o usuário não tem senha (provedor OAuth), não precisa verificar senha atual
    // Mas se tem, precisa verificar a senha atual
    if (user.password) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Senha atual é obrigatória" },
          { status: 400 }
        );
      }

      // Verifica senha atual
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return NextResponse.json(
          { error: "Senha atual está incorreta" },
          { status: 401 }
        );
      }
    }

    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Atualiza senha e limpa a flag de forcePasswordChange
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        password: hashedPassword,
        forcePasswordChange: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return NextResponse.json(
      {
        message: "Senha alterada com sucesso",
        user: updatedUser,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
