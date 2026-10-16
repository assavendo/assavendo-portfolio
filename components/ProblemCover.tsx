import Image from "next/image";
import type { Problem } from "@/lib/types";

export function ProblemCover({ p, priority = false, sizes = "(max-width: 700px) 100vw, 400px" }: { p: Pick<Problem, "cover_url" | "cover_alt" | "cover_credit" | "title" | "domains">; priority?: boolean; sizes?: string }) {
  if (!p.cover_url) return <div className="cover-fallback" aria-hidden="true">{p.domains?.name}</div>;
  return (
    <>
      <Image src={p.cover_url} alt={p.cover_alt || ""} fill sizes={sizes} priority={priority} style={{ objectFit: "cover" }} />
      {p.cover_credit ? <span className="credit">{p.cover_credit}</span> : null}
    </>
  );
}
