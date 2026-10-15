import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Check, CircleCheck, Heart, Minus, Plus, Sparkles, TrendingUp } from "lucide-react";
import type { PortfolioExample } from "@/data/portfolio-examples";

export function InteractiveDemo({ item }: { item: PortfolioExample }) {
  const [cart, setCart] = useState(0);
  const [selected, setSelected] = useState("10:30");
  const [checked, setChecked] = useState<number[]>([0]);
  const [liked, setLiked] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const total = useMemo(() => (cart * 24).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }), [cart]);

  return (
    <section className="demo-workspace" aria-label={`Démonstration interactive ${item.title}`}>
      <div className="demo-chrome">
        <span className="demo-light" /><span className="demo-light" /><span className="demo-light" />
        <span className="demo-url">aperçu.assavendo.fr / {item.slug}</span>
        <span className="demo-badge"><span /> Démo interactive</span>
      </div>
      <div className="demo-body">
        <div className="demo-brandline"><span className="mini-brand">{item.title.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span>{item.title}</span><span className="demo-brand-muted">Expérience de démonstration</span></div>
        {item.demo === "store" && <div className="demo-content">
          <div className="demo-copy"><span className="eyebrow">COLLECTION SIGNATURE</span><h3>Le beau, en toute simplicité.</h3><p>Une sélection pensée avec soin, livrée avec une attention particulière aux détails.</p><div className="demo-price">24,00 € <span>— édition découverte</span></div>
            <div className="demo-cart-control"><button aria-label="Retirer un article" onClick={() => setCart(Math.max(0, cart - 1))}><Minus size={15} /></button><span>{cart}</span><button aria-label="Ajouter un article" onClick={() => setCart(cart + 1)}><Plus size={15} /></button><button className="button button-primary" onClick={() => setCart(cart + 1)}>{cart ? `Panier · ${total}` : "Ajouter au panier"} <ArrowRight size={15} /></button></div>
          </div><div className={`demo-product-art art-${item.id % 8}`}><span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" /><span className="product-monogram">{item.title.slice(0, 1)}</span><span className="product-caption">SÉLECTION N° {item.number}</span></div>
        </div>}
        {item.demo === "dashboard" && <div className="demo-content dashboard-content">
          <div className="demo-copy"><span className="eyebrow">ESPACE DE PILOTAGE</span><h3>Votre activité, au bon niveau.</h3><p>Une vue claire des priorités de la semaine. Cochez une action pour la faire avancer.</p><div className="demo-checklist">{["Finaliser les priorités du jour", "Partager le point d’équipe", "Bloquer une plage de concentration"].map((label, index) => <button key={label} className="demo-check-row" onClick={() => setChecked((value) => value.includes(index) ? value.filter((itemIndex) => itemIndex !== index) : [...value, index])}><span className={checked.includes(index) ? "check-box checked" : "check-box"}>{checked.includes(index) && <Check size={12} />}</span>{label}</button>)}</div></div>
          <div className="metric-stack"><div className="metric-card"><span>Actions réalisées</span><strong>{checked.length}<small> / 3</small></strong><div className="metric-bar"><i style={{ width: `${checked.length / 3 * 100}%` }} /></div></div><div className="metric-card metric-dark"><span><TrendingUp size={15} /> Progression cette semaine</span><strong>+{14 + checked.length * 3}%</strong><small>Un aperçu visuel, pas une donnée réelle.</small></div></div>
        </div>}
        {item.demo === "course" && <div className="demo-content course-content">
          <div className="demo-copy"><span className="eyebrow">MICRO-LEÇON · 02 MIN</span><h3>Apprendre en faisant.</h3><p>Un parcours court combine une idée clé et une question pour vérifier la compréhension.</p><div className="lesson-progress"><span>02 / 06</span><i><b /></i><span>Leçon</span></div></div>
          <div className="quiz-card"><span className="quiz-count">QUESTION 01</span><h4>Quel est le meilleur prochain pas ?</h4>{["Tester une petite action", "Tout automatiser d’emblée", "Ajouter des étapes sans mesure"].map((option, index) => <button key={option} className={`quiz-option ${answer === index ? (index === 0 ? "correct" : "incorrect") : ""}`} onClick={() => setAnswer(index)}>{option}{answer === index && (index === 0 ? <CircleCheck size={17} /> : <span>↻</span>)}</button>)}{answer === 0 && <p className="quiz-feedback">Exact : un test court donne un signal exploitable.</p>}</div>
        </div>}
        {item.demo === "booking" && <div className="demo-content booking-content">
          <div className="demo-copy"><span className="eyebrow">PRENDRE RENDEZ-VOUS</span><h3>Choisissez un moment pour vous.</h3><p>Un parcours de réservation calme et lisible, du choix du créneau à la confirmation.</p><div className="appointment-service"><CalendarDays size={18} /><span>Session découverte · 45 min<small>En visio ou au studio</small></span><strong>45 €</strong></div></div>
          <div className="slot-card"><span className="eyebrow">MARDI 21 OCTOBRE</span><div className="slot-grid">{["09:00", "10:30", "13:00", "14:30"].map((time) => <button key={time} className={selected === time ? "slot active" : "slot"} onClick={() => setSelected(time)}>{time}</button>)}</div><button className="button button-primary slot-confirm" onClick={() => setSelected(`${selected} · réservé`)}><CalendarDays size={15} /> Choisir {selected.includes("réservé") ? "un autre créneau" : selected}</button></div>
        </div>}
        {item.demo === "creator" && <div className="demo-content creator-content">
          <div className="creator-card"><div className="creator-avatar">A</div><span className="eyebrow">STUDIO INDÉPENDANT</span><h3>De l’intention au résultat.</h3><p>{item.tagline}</p><div className="creator-tags"><span>Identité</span><span>Direction artistique</span><span>Digital</span></div><button className="button button-primary" onClick={() => setLiked(!liked)}>{liked ? <Check size={16} /> : <Heart size={16} />} {liked ? "Enregistré" : "Enregistrer ce studio"}</button></div>
          <div className="portfolio-sample"><div className="sample-art art-3"><span className="sample-mark">Aa</span></div><div className="sample-art art-5"><span className="sample-mark">01</span></div><div className="sample-caption">Une sélection éditoriale de projets et de méthodes.</div></div>
        </div>}
        {item.demo === "impact" && <div className="demo-content impact-content">
          <div className="demo-copy"><span className="eyebrow">IMPACT EN MOUVEMENT</span><h3>Chaque geste compte, s’il se voit.</h3><p>Suivez des actions concrètes et comprenez ce qui progresse, sans indicateurs décoratifs.</p><button className="button button-primary" onClick={() => setLiked(!liked)}><Sparkles size={16} /> {liked ? "Vous participez" : "Rejoindre l’initiative"}</button></div>
          <div className="impact-stat-grid"><div className="impact-stat"><span>Objets réemployés</span><strong>{128 + (liked ? 1 : 0)}</strong><small>Dans ce prototype</small></div><div className="impact-stat"><span>Communauté</span><strong>{42 + (liked ? 1 : 0)}</strong><small>Contributeurs test</small></div><div className="impact-ring"><span>{liked ? "+1" : "72%"}<small>objectif test</small></span></div></div>
        </div>}
      </div>
      <div className="demo-disclaimer"><Sparkles size={14} /> Prototype de portfolio : les données et transactions affichées sont fictives.</div>
    </section>
  );
}
