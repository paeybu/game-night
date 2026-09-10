"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/spinner";

export default function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2.5 rounded-full bg-foreground px-8 py-4 text-lg font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-60"
    >
      {pending && <Spinner className="size-5" />}
      {pending ? "กำลังสร้างห้อง…" : children}
    </button>
  );
}
