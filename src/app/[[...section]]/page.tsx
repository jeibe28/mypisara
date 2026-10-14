import { notFound, redirect } from "next/navigation";
import { configured, currentUser, emailAvailable } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { Boards } from "@/components/boards";
import { loadDashboard, loadPreferences } from "@/lib/user-preferences";
import { Settings } from "@/components/settings";

export const dynamic = "force-dynamic";

// Routes: "/" board library, "/boards/:id" board editor. Both also work under
// "/demo", which keeps everything in this browser and never reaches the database.
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section = [] } = await params;
  const explicitDemo = section[0] === "demo";
  const parts = explicitDemo ? section.slice(1) : section;
  const settings = parts[0] === "settings" && parts.length === 1;
  if (parts.length && !settings && !(parts[0] === "boards" && parts.length <= 2)) notFound();
  const detailId = parts[1];

  const demo = explicitDemo || !configured();
  const user = demo ? null : await currentUser();
  if (!demo && !user) redirect("/login");
  const [preferences, dashboard] = user
    ? await Promise.all([loadPreferences(user.id), loadDashboard(user.id)])
    : [null, null];
  return (
    <AppShell
      demo={demo}
      user={user ? { id: user.id, name: user.name, email: user.email, image: user.image, emailVerified: user.emailVerified } : null}
      emailEnabled={emailAvailable()}
      dashboard={dashboard}
      preferences={preferences}
    >
      {settings ? <Settings /> : <Boards key={detailId ?? "library"} detailId={detailId} />}
    </AppShell>
  );
}
