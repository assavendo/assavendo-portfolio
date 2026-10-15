import { useState } from "react";
import { ArrowRight, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [brief, setBrief] = useState("");
  const [sent, setSent] = useState(false);
  const mutation = trpc.contact.submit.useMutation({
    onSuccess: () => { setSent(true); setName(""); setEmail(""); setBrief(""); toast.success("Votre demande a bien été transmise."); },
    onError: (error) => toast.error(error.message || "Impossible d’envoyer votre demande."),
  });
  if (sent) return <div className="contact-success"><CheckCircle2 size={28} /><div><strong>Merci, votre message est transmis.</strong><span>Il apparaîtra dans l’espace de gestion Assavendo.</span></div><button type="button" className="text-link" onClick={() => setSent(false)}>Envoyer un autre message <ArrowRight size={14} /></button></div>;
  return <form className="contact-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate({ name, email, message: brief }); }}>
    <div className="contact-fields"><label>Votre nom<input required minLength={2} maxLength={80} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Comment vous appeler ?" /></label><label>Votre e-mail<input required type="email" maxLength={320} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@entreprise.fr" /></label></div>
    <label>Votre projet<textarea required minLength={12} maxLength={4000} rows={4} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="L’idée, le besoin, la prochaine étape…" /></label>
    <div className="form-footer"><span>Vos informations sont utilisées uniquement pour répondre à votre demande.</span><button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Envoi…" : "Envoyer le message"}<Send size={15} /></button></div>
  </form>;
}
