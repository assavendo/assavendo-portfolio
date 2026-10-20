import { ImageResponse } from "next/og";
import { getProblem } from "@/lib/data";
export const alt = "Fiche problème Assavendo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProblem((await params).slug);
  const title = p?.title ?? "Assavendo"; const domain = p?.domains?.name ?? "Problèmes web résolus";
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", background: "#0a1d2c", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72 }}>
      <div style={{ display: "flex", fontSize: 30, color: "#f5c400", fontWeight: 700 }}>{domain}</div>
      <div style={{ display: "flex", fontSize: title.length > 70 ? 56 : 68, fontWeight: 700, lineHeight: 1.08 }}>{title}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 34, fontWeight: 700 }}><span>Assavendo</span><div style={{ width: 120, height: 10, background: "#f5c400" }} /></div>
    </div>, size);
}
