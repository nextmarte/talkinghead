import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";

// Script para criar admin inicial
// Uso: curl -X POST http://localhost:3000/api/auth/setup-admin \
//   -H "Content-Type: application/json" \
//   -d '{"email":"admin@example.com","password":"admin123","name":"Admin","secret":"SETUP_SECRET_2024"}'

const SETUP_SECRET = process.env.ADMIN_SETUP_SECRET || "SETUP_SECRET_2024";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name, secret } = body;

    // Verifica secret para evitar criação não autorizada
    if (secret !== SETUP_SECRET) {
      return NextResponse.json(
        { error: "Acesso não autorizado" },
        { status: 403 }
      );
    }

    // Verifica se já existe um admin
    const existingAdmin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
    });

    if (existingAdmin) {
      return NextResponse.json(
        { error: "Já existe um administrador cadastrado" },
        { status: 409 }
      );
    }

    // Valida dados básicos
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Email, senha e nome são obrigatórios" },
        { status: 400 }
      );
    }

    // Verifica se email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // Se existe, promove para admin
      const admin = await prisma.user.update({
        where: { email },
        data: { role: "ADMIN" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });

      return NextResponse.json(
        { message: "Usuário promovido para administrador", admin },
        { status: 200 }
      );
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 12);

    // Cria admin
    const admin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "ADMIN",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { message: "Administrador criado com sucesso", admin },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar admin:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
