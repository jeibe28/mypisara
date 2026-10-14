import { redirect } from "next/navigation";
import { configured, emailAvailable } from "@/lib/auth";
import { ForgotForm } from "./forgot-form";

export const dynamic = "force-dynamic";

export default function ForgotPassword() {
  if (!configured() || !emailAvailable()) redirect("/login");
  return <ForgotForm />;
}
