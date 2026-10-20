import Image from "next/image";
import type { Problem } from "@/lib/types";
import { DomainArt } from "./DomainArt";

/** Photographie choisie dans l'administration, sinon illustration originale du domaine (jamais de fausse capture). */
export function ProblemCover({ p, priority = false, sizes = "(max-width: 700px) 100vw, 400px" }: { p: Pick<Problem, "cover_url" | "cover_alt" | "cover_credit" | "title" | "domains">; priority?: boolean; sizes?: string }) {
  if (!p.cover_url) return <DomainArt slug={p.domains?.slug} />;
  return (
    <>
      <Image src={p.cover_url} alt={p.cover_alt || ""} fill sizes={sizes} priority={priority} style={{ objectFit: "cover" }} />
      {p.cover_credit ? <span className="credit">{p.cover_credit}</span> : null}
    </>
  );
}
