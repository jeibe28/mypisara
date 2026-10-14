import { redirect } from "next/navigation";
import { configured } from "@/lib/auth";
import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  if (!configured()) redirect("/login");
  const { token, error } = await searchParams;
  return <ResetForm token={token ?? ""} expired={Boolean(error) || !token} />;
}
