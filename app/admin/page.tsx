import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import AdminDashboard from "./AdminDashboard";

export default async function AdminPage() {
  const session = await auth();

  if (!session || session.user?.role !== "ADMIN") {
    redirect("/");
  }

  // Busca estatísticas
  const [usersCount, conversationsCount, messagesCount, recentUsers, recentConversations] =
    await Promise.all([
      prisma.user.count(),
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          _count: { select: { conversations: true } },
        },
      }),
      prisma.conversation.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
          _count: { select: { messages: true } },
        },
      }),
    ]);

  const stats = {
    usersCount,
    conversationsCount,
    messagesCount,
  };

  return (
    <AdminDashboard
      stats={stats}
      recentUsers={recentUsers}
      recentConversations={recentConversations}
    />
  );
}
