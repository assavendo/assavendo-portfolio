import { ImageResponse } from "next/og";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", background: "#0b3c5d", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="120" height="120" viewBox="0 0 64 64"><path d="M15 50 32 14l17 36M22 38h20" stroke="#f5c400" strokeWidth="6" fill="none" /></svg>
    </div>, size);
}
