import { ImageResponse } from "next/og";
export const alt = "Assavendo — les problèmes web qui coûtent des clients, résolus pour de bon";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", background: "#0a1d2c", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 44, fontWeight: 700 }}>
        <svg width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0b3c5d" /><path d="M15 50 32 14l17 36M22 38h20" stroke="#f5c400" strokeWidth="6" fill="none" /></svg>Assavendo
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, maxWidth: 980 }}>Les problèmes web qui coûtent des clients, résolus pour de bon.</div>
        <div style={{ width: 160, height: 10, background: "#f5c400" }} />
      </div>
    </div>, size);
}
