import Link from "next/link";
export default function NotFound() {
  return <div className="section"><div className="wrap" style={{ maxWidth: 640 }}><h1>Page introuvable</h1><p>Cette adresse n'existe pas ou n'est plus publiée.</p><Link className="btn btn-primary" href="/problemes">Voir les problèmes résolus</Link></div></div>;
}
