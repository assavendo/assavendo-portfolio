"use client";

import { useRef, useState, type FormEvent } from "react";

type Props = {
  action: (formData: FormData) => Promise<void>;
  fieldLabel: string;
  placeholder: string;
  buttonLabel: string;
  submissionId: string;
};

export default function AiRequestForm({ action, fieldLabel, placeholder, buttonLabel, submissionId }: Props) {
  const [pending, setPending] = useState(false);
  const locked = useRef(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (locked.current) {
      event.preventDefault();
      return;
    }
    locked.current = true;
    setPending(true);
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="buy-form" aria-busy={pending}>
      <input type="hidden" name="submission_id" value={submissionId.current} />
      <label className="field">
        {fieldLabel}
        <textarea
          className="input"
          name="request"
          rows={3}
          maxLength={1500}
          placeholder={placeholder}
          required
          minLength={10}
          disabled={pending}
        />
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" type="submit" disabled={pending}>
          {pending ? "Traitement…" : buttonLabel}
        </button>
        {pending ? <span className="muted small">Demande envoyée. Une seule exécution est en cours.</span> : null}
      </div>
    </form>
  );
}
