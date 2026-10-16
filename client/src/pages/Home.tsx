import { ArrowDown, ArrowRight, ArrowUpRight, Code2, Layers3, ShoppingBag, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { SiteShell } from "@/components/SiteShell";
import { ExampleCard } from "@/components/ExampleCard";
import { ContactForm } from "@/components/ContactForm";
import { portfolioCategories, portfolioExamples } from "@/data/portfolio-examples";
import { usePageMeta } from "@/lib/meta";

export default function Home() {
  usePageMeta("Assavendo — Studio digital & commerce", "Portfolio digital, démonstrations interactives et créations e-commerce. Explorez 100 problèmes web documentés, puis découvrez les produits Assavendo.");
  const featured = [portfolioExamples[1], portfolioExamples[11], portfolioExamples[53]];
  return <SiteShell>
    <section className="hero-section">
      <div className="hero-copy">
        <span className="eyebrow hero-eyebrow"><span className="eyebrow-line" /> STUDIO DIGITAL INDÉPENDANT</span>
        <h1>Des idées claires.<br /><em>Des expériences</em><br />qui font avancer.</h1>
        <p className="hero-lede">Assavendo conçoit des expériences numériques élégantes et utiles — du premier diagnostic aux produits qui se vendent.</p>
        <div className="hero-actions"><Link href="/portfolio" className="button button-primary">Explorer le portfolio <ArrowRight size={17} /></Link><Link href="/#expertises" className="button button-quiet">Découvrir nos expertises <ArrowDown size={16} /></Link></div>
        <div className="hero-proof"><span className="proof-mark"><Sparkles size={15} /></span><span>Problèmes testables, projets lisibles, résultats sans promesse gonflée.</span></div>
      </div>
      <div className="hero-visual">
        <img src="/manus-storage/async-images/TFbA7al6ORF4nnmaavF8Gg/image-1.webp" alt="Composition abstraite éditoriale, arches bleu pétrole et papier ivoire" />
        <div className="hero-index"><span>01—10</span><small>ÉDITIONS DE PORTFOLIO</small></div>
        <div className="hero-floating-card"><span className="floating-kicker">UN STUDIO, 100 RÉPONSES</span><strong>Du problème<br />à la solution.</strong><Link href="/portfolio">Voir les fiches <ArrowUpRight size={14} /></Link></div>
      </div>
      <div className="hero-bottomline"><span>Stratégie · Design · Développement</span><span>France <i>—</i> En ligne partout</span></div>
    </section>

    <section className="proof-strip" aria-label="Repères du portfolio"><div><strong>100</strong><span>problèmes explorables</span></div><div><strong>10</strong><span>domaines web</span></div><div><strong>01</strong><span>même exigence de détail</span></div><Link href="/portfolio">Parcourir la collection <ArrowRight size={15} /></Link></section>

    <section className="section section-services" id="expertises">
      <div className="section-heading"><div><span className="eyebrow">CE QUE NOUS FAISONS</span><h2>Du fond, puis de la forme.</h2></div><p>Une bonne expérience ne se contente pas d’être belle. Elle clarifie l’offre, enlève les frictions et transforme l’intention en action.</p></div>
      <div className="service-list">
        <article className="service-row"><span className="service-index">01</span><span className="service-icon"><Layers3 size={20} /></span><div><h3>Stratégie & conception</h3><p>Positionnement, parcours, architecture de contenu et prototype pour cadrer ce qui doit vraiment être construit.</p></div><span className="service-tags">Recherche · UX · Prototypage</span></article>
        <article className="service-row"><span className="service-index">02</span><span className="service-icon"><Code2 size={20} /></span><div><h3>Design & développement web</h3><p>Sites vitrines, outils numériques et interfaces adaptatives, pensés pour durer et évoluer sans alourdir l’expérience.</p></div><span className="service-tags">UI · Front-end · Produit</span></article>
        <article className="service-row"><span className="service-index">03</span><span className="service-icon"><ShoppingBag size={20} /></span><div><h3>E-commerce & croissance</h3><p>Catalogues, fiches produits, contenu éditorial et parcours d’achat construits autour de votre vraie offre.</p></div><span className="service-tags">Commerce · Conversion · Contenu</span></article>
      </div>
      <div className="category-orbit"><span>CHAMPS D’EXPLORATION</span>{portfolioCategories.map((category, index) => <Link key={category.name} href={`/portfolio?categorie=${encodeURIComponent(category.name)}`}><i>{String(index + 1).padStart(2, "0")}</i>{category.name}<ArrowUpRight size={13} /></Link>)}</div>
    </section>

    <section className="section featured-section">
      <div className="section-heading"><div><span className="eyebrow">LA COLLECTION</span><h2>100 problèmes. Des réponses concrètes.</h2></div><Link href="/portfolio" className="text-link">Voir les 100 fiches <ArrowRight size={16} /></Link></div>
      <div className="example-grid featured-grid">{featured.map((item) => <ExampleCard item={item} key={item.slug} />)}</div>
      <div className="collection-note"><span className="collection-note-number">100</span><p>Chaque problème est documenté comme un vrai cas de travail : symptôme, cause technique, solution et démonstration testable ou consultable directement sur le site.</p><Link href="/portfolio" className="button button-outline">Entrer dans le catalogue <ArrowRight size={16} /></Link></div>
    </section>

    <section className="shop-callout"><div className="shop-callout-inner"><div><span className="eyebrow eyebrow-light">LES CRÉATIONS ASSAVENDO</span><h2>Des exemples à explorer.<br /><em>Des créations à adopter.</em></h2><p>La boutique est un espace distinct du portfolio : seuls les produits réellement publiés y seront proposés à la vente.</p><Link href="/boutique" className="button button-light">Découvrir la boutique <ArrowRight size={16} /></Link></div><div className="shop-callout-mark"><span>A</span><i /><b /></div></div></section>

    <section className="section contact-section" id="contact"><div className="section-heading contact-heading"><div><span className="eyebrow">ET SI ON EN PARLAIT ?</span><h2>La prochaine bonne idée<br /><em>peut commencer ici.</em></h2></div><p>Décrivez votre projet en quelques lignes. Votre message sera transmis à l’espace d’administration Assavendo.</p></div><ContactForm /></section>
  </SiteShell>;
}
