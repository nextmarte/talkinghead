import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import crypto from "crypto";

// GET /api/admin/invitations - Lista convites (com filtro)
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
    const status = searchParams.get("status"); // "pending" ou "used"

    let where: any = {};
    
    if (status === "pending") {
      where.usedAt = null;
      where.expiresAt = { gt: new Date() };
    } else if (status === "used") {
      where.usedAt = { not: null };
    }

    const invitations = await prisma.invitation.findMany({
      where,
      select: {
        id: true,
        token: true,
        email: true,
        role: true,
        expiresAt: true,
        usedAt: true,
        usedBy: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ invitations }, { status: 200 });
  } catch (error) {
    console.error("Erro ao listar convites:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

// POST /api/admin/invitations - Cria novo convite
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
    const { email, role = "USER", expiresInHours = 48 } = body;

    // Gera token aleatório
    const token = crypto.randomBytes(32).toString("hex");
    
    // Define expiração
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        token,
        email: email || null,
        role: role as "USER" | "ADMIN",
        expiresAt,
      },
      select: {
        id: true,
        token: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    // Gera URL do convite
    const invitationLink = `${process.env.NEXT_PUBLIC_BASE_URL || "https://talkinghead.cid-uff.net"}/register?token=${token}`;

    return NextResponse.json(
      {
        message: "Convite criado com sucesso",
        invitation,
        invitationLink,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar convite:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/invitations/[id] - Cancela um convite
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const invitationId = searchParams.get("id");

    if (!invitationId) {
      return NextResponse.json(
        { error: "ID do convite é obrigatório" },
        { status: 400 }
      );
    }

    // Verifica se convite existe e não foi usado
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Convite não encontrado" },
        { status: 404 }
      );
    }

    if (invitation.usedAt) {
      return NextResponse.json(
        { error: "Não é possível cancelar um convite já utilizado" },
        { status: 400 }
      );
    }

    await prisma.invitation.delete({
      where: { id: invitationId },
    });

    return NextResponse.json(
      { message: "Convite cancelado com sucesso" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro ao deletar convite:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
