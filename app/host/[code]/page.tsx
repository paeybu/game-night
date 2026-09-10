import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getAdminSession, getSessionByCode } from "@/lib/session";
import HostDisplay from "./host-display";

export default async function HostPage({ params }: PageProps<"/host/[code]">) {
  await connection();

  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) notFound();

  const isAdmin = Boolean(await getAdminSession(code));

  return <HostDisplay session={session} isAdmin={isAdmin} />;
}
