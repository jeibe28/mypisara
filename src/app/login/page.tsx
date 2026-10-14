import { redirect } from "next/navigation";
import { configured, currentUser, emailAvailable } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function Login() {
  if (configured() && (await currentUser())) redirect("/");
  return <LoginForm
      configured={configured()}
      signUpEnabled={process.env.DISABLE_SIGN_UP !== "true"}
      resetEnabled={configured() && emailAvailable()}
    />;
}
