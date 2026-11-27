"use client";

import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useState } from "react";

import { ui } from "@/components/ui/styles";
import { apiFetch, ApiError, errorMessage } from "@/lib/client/api";
import { useT } from "@/lib/i18n/provider";
import { CONTACT_LIMITS, contactFieldErrors, type ContactField as Field } from "@/lib/contact/schema";
import { translateLoose } from "@/lib/i18n/translate";

/** "Contact us" form: name, email, phone, note and consent; saved by /api/contact. */
export function ContactForm({ source }: { source: string }) {
  const t = useT();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", note: "", website: "" });
  const [consent, setConsent] = useState(false);
  const [shownAt] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  /** Fields the visitor has left (or tried to submit): only these show errors. */
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const payload = (f = form, c = consent) => ({ ...f, phone: f.phone || null, note: f.note || null, consent: c, source, shownAt });
  /** Same rules as the server (src/lib/contact/schema.ts). */
  const check = (f = form, c = consent, only?: Partial<Record<Field, boolean>>) => {
    const all = contactFieldErrors(payload(f, c));
    const shown: Partial<Record<Field, string>> = {};
    for (const [key, message] of Object.entries(all) as Array<[Field, string]>) {
      if (!only || only[key]) shown[key] = translateLoose(message);
    }
    setFieldErrors(shown);
    return all;
  };
  const set = (key: Exclude<Field, "consent">) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = { ...form, [key]: e.target.value };
    setForm(next);
    // Once a field showed an error, re-check it while typing so it clears as soon as it is right.
    if (touched[key]) check(next, consent, touched);
  };
  const blur = (key: Field) => () => {
    const nextTouched = { ...touched, [key]: true };
    setTouched(nextTouched);
    check(form, consent, nextTouched);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const all = { fullName: true, email: true, phone: true, note: true, consent: true };
    setTouched(all);
    const problems = check(form, consent, all);
    if (Object.keys(problems).length > 0) {
      const first = (["fullName", "email", "phone", "note", "consent"] as const).find((k) => problems[k]);
      document.getElementById(`contact-${first}`)?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await apiFetch("/api/contact", {
        method: "POST",
        json: payload(),
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        const next: Partial<Record<Field, string>> = {};
        for (const [key, messages] of Object.entries(err.details)) {
          if (["fullName", "email", "phone", "note", "consent"].includes(key)) next[key as Field] = errorMessage(new Error(messages[0]));
        }
        setFieldErrors(next);
        if (Object.keys(next).length === 0) setError(errorMessage(err));
      } else setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h2 className="mt-4 font-brand text-3xl">{t("Teşekkürler!")}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-stone-600">
          {t("Bilgileriniz bize ulaştı. En kısa sürede sizinle iletişime geçeceğiz.")}
        </p>
      </div>
    );
  }

  const fieldClass = (key: Field) => `${ui.input} ${fieldErrors[key] ? "border-rose-400" : ""}`;
  const fieldError = (key: Field) =>
    fieldErrors[key] && (
      <span id={`contact-${key}-error`} role="alert" className="mt-1 block text-xs text-rose-600">
        {fieldErrors[key]}
      </span>
    );

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-3xl border border-stone-200 bg-white p-6 sm:p-8">
      <label className="block">
        <span className={ui.label}>{t("Ad Soyad *")}</span>
        <input id="contact-fullName" value={form.fullName} onChange={set("fullName")} onBlur={blur("fullName")} required maxLength={CONTACT_LIMITS.name} autoComplete="name" aria-invalid={Boolean(fieldErrors.fullName)} aria-describedby="contact-fullName-error" className={fieldClass("fullName")} />
        {fieldError("fullName")}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={ui.label}>{t("E-posta *")}</span>
          <input id="contact-email" type="email" value={form.email} onChange={set("email")} onBlur={blur("email")} required maxLength={CONTACT_LIMITS.email} autoComplete="email" inputMode="email" aria-invalid={Boolean(fieldErrors.email)} aria-describedby="contact-email-error" className={fieldClass("email")} />
          {fieldError("email")}
        </label>
        <label className="block">
          <span className={ui.label}>{t("Telefon")}</span>
          <input id="contact-phone" type="tel" value={form.phone} onChange={set("phone")} onBlur={blur("phone")} maxLength={40} autoComplete="tel" inputMode="tel" placeholder="0532 123 45 67" aria-invalid={Boolean(fieldErrors.phone)} aria-describedby="contact-phone-error" className={fieldClass("phone")} />
          {fieldError("phone")}
        </label>
      </div>
      <label className="block">
        <span className={`${ui.label} flex justify-between`}>
          {t("Notunuz")}
          <span className={`font-normal tabular-nums ${form.note.length > CONTACT_LIMITS.note * 0.9 ? "text-amber-700" : "text-stone-400"}`}>
            {form.note.length} / {CONTACT_LIMITS.note}
          </span>
        </span>
        <textarea
          id="contact-note"
          value={form.note}
          onChange={set("note")}
          onBlur={blur("note")}
          aria-invalid={Boolean(fieldErrors.note)}
          aria-describedby="contact-note-error"
          rows={5}
          maxLength={CONTACT_LIMITS.note}
          placeholder={t("Etkinliğiniz, tarihi, misafir sayısı ya da merak ettikleriniz…")}
          className={fieldClass("note")}
        />
        {fieldError("note")}
      </label>
      {/* Honeypot: hidden from people, filled by bots. */}
      <input type="text" name="website" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <label className="flex items-start gap-3 text-xs leading-relaxed text-stone-600">
        <input
          id="contact-consent"
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (touched.consent) check(form, e.target.checked, touched);
          }}
          className={`mt-0.5 ${ui.checkbox}`}
          aria-invalid={Boolean(fieldErrors.consent)}
          aria-describedby="contact-consent-error"
        />
        <span>
          {t("Bilgilerimin, talebime dönüş yapılması amacıyla KVKK kapsamında işleneceği konusunda bilgilendirildim.")}
          {fieldError("consent")}
        </span>
      </label>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("Gönder")}
      </button>
    </form>
  );
}
