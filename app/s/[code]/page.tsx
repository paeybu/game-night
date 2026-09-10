import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getSessionByCode } from "@/lib/session";
import GuestApp from "./guest-app";

export default async function GuestPage({ params }: PageProps<"/s/[code]">) {
  await connection();

  const { code } = await params;
  const session = await getSessionByCode(code);
  if (!session) notFound();

  return <GuestApp session={session} />;
}
