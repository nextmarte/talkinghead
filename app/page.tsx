import { auth } from "@/auth";
import { redirect } from "next/navigation";
import UnifiedCallInterface from '@/app/components/UnifiedCallInterface';

export default async function Home() {
  const session = await auth();
  
  if (!session) {
    redirect("/login");
  }

  return <UnifiedCallInterface />;
}
