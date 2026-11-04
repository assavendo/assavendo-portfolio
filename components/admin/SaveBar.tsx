"use client";
import { useEffect, useRef } from "react";
import type { AdminState } from "@/app/actions/admin";

/**
 * Barre d'enregistrement collante : le bouton reste toujours visible et cliquable, même sur un long formulaire.
 * Le résultat (succès ou erreur) s'affiche dans la barre ET reçoit le focus lecteur d'écran. Les formulaires utilisent
 * noValidate : aucune validation navigateur ne peut bloquer silencieusement l'envoi (un champ requis hors de l'écran donnait
 * l'impression que le bouton ne répondait pas) ; toutes les règles sont vérifiées côté serveur avec un message clair.
 */
export function SaveBar({ pending, state, cree = false }: { pending: boolean; state: AdminState; cree?: boolean }) {
  const msg = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state.error || state.ok) msg.current?.focus(); }, [state]);
  return (
    <div className="save-bar full no-print">
      <div className="save-bar-in">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
        <p ref={msg} tabIndex={-1} role={state.error ? "alert" : "status"} className={`save-msg${state.error ? " is-err" : state.ok || cree ? " is-ok" : ""}`}>
          {state.error ?? state.ok ?? (cree ? "Créé. Vous pouvez continuer à le modifier ici." : "Les brouillons s'enregistrent sans condition ; la publication vérifie que la fiche est complète.")}
        </p>
      </div>
    </div>
  );
}
