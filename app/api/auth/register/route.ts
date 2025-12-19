import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";

const registerSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  invitationToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, password, invitationToken } = parsed.data;

    // Se houver token de convite, valida ele
    let invitation = null;
    if (invitationToken) {
      invitation = await prisma.invitation.findUnique({
        where: { token: invitationToken },
      });

      if (!invitation || invitation.usedAt || invitation.expiresAt < new Date()) {
        return NextResponse.json(
          { error: "Convite inválido ou expirado" },
          { status: 400 }
        );
      }

      // Se o convite for para um email específico, valida
      if (invitation.email && invitation.email !== email) {
        return NextResponse.json(
          { error: "Este convite não é para este email" },
          { status: 400 }
        );
      }
    } else if (process.env.REQUIRE_INVITATION === "true") {
      // Se o sistema exige convite e nenhum foi fornecido
      return NextResponse.json(
        { error: "Registro permitido apenas com convite" },
        { status: 403 }
      );
    }

    // Verifica se email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Este email já está cadastrado" },
        { status: 409 }
      );
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 12);

    // Cria usuário
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: invitation?.role || "USER",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // Marca convite como usado
    if (invitation) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: {
          usedAt: new Date(),
          usedBy: user.id,
        },
      });
    }

    return NextResponse.json(
      { message: "Usuário criado com sucesso", user },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao registrar usuário:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
