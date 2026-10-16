import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { signOut } from "@/app/actions/admin";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata: Metadata = { title: "Administration", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <div className="wrap admin">
      <div><AdminNav /><form action={signOut} style={{ marginTop: "1rem" }}><p className="muted small">{user.email}</p><button className="btn btn-ghost btn-sm">Se déconnecter</button></form></div>
      <div>{children}</div>
    </div>
  );
}
