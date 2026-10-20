import type { Metadata } from "next";
import { Todo, legal, v } from "@/components/LegalPage";
export const metadata: Metadata = { title: "Mentions légales", alternates: { canonical: "/mentions-legales" }, robots: { index: false } };
export default function Page() {
  return <div className="section legal"><div className="wrap" style={{ maxWidth: 780 }}>
    <h1>Mentions légales</h1><Todo />
    <h2>Éditeur du site</h2><p>{v(legal.name)}, {v(legal.form)}<br />SIRET : {v(legal.siret)}{legal.vat ? <><br />TVA intracommunautaire : {legal.vat}</> : null}<br />Adresse : {v(legal.address)}<br />E-mail : {v(legal.email)}<br />Directeur de la publication : {v(legal.director)}</p>
    <h2>Hébergement</h2><p>{legal.host}</p>
    <h2>Propriété intellectuelle</h2><p>Les contenus du site (textes, outils, code, mise en page) sont la propriété d'Assavendo, sauf mention contraire. Les photographies sont créditées auprès de leurs auteurs.</p>
    <h2>Responsabilité</h2><p>Les outils proposés sont fournis à titre d'illustration et d'aide au calcul. Leurs résultats dépendent des données saisies ; ils ne constituent ni un conseil juridique, ni un conseil financier, ni un engagement de résultat.</p>
  </div></div>;
}
