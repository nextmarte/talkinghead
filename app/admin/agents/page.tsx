import { auth } from "@/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import AgentsDashboard from "./AgentsDashboard";

export default async function AgentsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  // Busca agentes
  const agents = await prisma.agent.findMany({
    include: {
      _count: {
        select: {
          conversations: true,
          knowledgeBase: true,
        },
      },
      knowledgeBase: {
        select: {
          id: true,
          fileName: true,
          fileSize: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
    orderBy: [
      { isDefault: "desc" },
      { createdAt: "desc" },
    ],
  });

  return <AgentsDashboard agents={agents} />;
}
