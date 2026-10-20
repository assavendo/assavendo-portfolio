import Link from "next/link";
import type { Problem } from "@/lib/types";
import { hasOperationalTool } from "@/lib/tool-keys";
import { ProblemCover } from "./ProblemCover";

export function ProblemCard({ p }: { p: Problem }) {
  return (
    <article className="card">
      <div className="card-media"><ProblemCover p={p} /></div>
      <div className="card-body">
        <div className="card-foot" style={{ paddingTop: 0 }}>
          {p.domains ? <span className="tag">{p.domains.name}</span> : null}
          {/* Le badge reflète l'outil RÉELLEMENT affiché sur la page : même fonction que la fiche et le compteur de l'accueil. */}
          {hasOperationalTool(p) ? <span className="tag tag-tool">Outil à tester</span> : null}
        </div>
        <h3><Link href={`/problemes/${p.slug}`}>{p.title}</Link></h3>
        <p>{p.hook}</p>
      </div>
    </article>
  );
}
