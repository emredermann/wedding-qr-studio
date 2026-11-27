"use client";

import { CheckCircle2, Heart, Loader2, Minus, Pencil, Plus, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { InvitationCard } from "@/components/invitations/InvitationCard";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { ui } from "@/components/ui/styles";
import { apiFetch, ApiError, errorMessage } from "@/lib/client/api";
import { useLang, useT } from "@/lib/i18n/provider";
import { INVITE_LIMITS, type InviteViewDto } from "@/lib/invitations/model";

/**
 * Guest page of an invitation link: the invitation, then the RSVP form.
 * Attending asks for one full name per person (up to the link's limit);
 * the first is pre-filled with the name the host wrote. A saved reply is
 * shown with "change" until the deadline.
 */
export function InviteGuestApp({ token }: { token: string }) {
  const t = useT();
  const { locale } = useLang();
  const router = useRouter();
  const [view, setView] = useState<InviteViewDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [attending, setAttending] = useState<boolean | null>(null);
  const [party, setParty] = useState<string[]>([""]);
  const [name, setName] = useState("");
  const [dietary, setDietary] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [badIndex, setBadIndex] = useState<number | null>(null);

  const fill = (v: InviteViewDto) => {
    setView(v);
    const r = v.reply;
    setAttending(r ? r.status === "yes" : null);
    setParty(r && r.party.length ? r.party : [v.name ?? ""]);
    setDietary(r?.dietary ?? "");
    setMessage(r?.message ?? "");
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await apiFetch<InviteViewDto>(`/api/invite/${encodeURIComponent(token)}`);
        if (cancelled) return;
        setView(v);
        const r = v.reply;
        setAttending(r ? r.status === "yes" : null);
        setParty(r && r.party.length ? r.party : [v.name ?? ""]);
        setDietary(r?.dietary ?? "");
        setMessage(r?.message ?? "");
      } catch (e) {
        if (!cancelled) setLoadError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loadError) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-stone-50 px-6 text-center">
        <Heart className="h-8 w-8 text-stone-400" />
        <h1 className="font-serif text-2xl text-stone-900">{t("Davetiye bulunamadı")}</h1>
        <p className="max-w-sm text-sm text-stone-600">{loadError}</p>
      </main>
    );
  }
  if (!view) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-stone-50 text-stone-400">
        <Loader2 className="h-7 w-7 animate-spin" />
      </main>
    );
  }

  const accent = view.design.accent || view.event.themeColor || "#7f6d51";
  const greeting = view.kind === "personal" ? view.name : null;
  const showForm = view.canReply && (editing || !view.reply);
  const deadlineText = view.deadline
    ? new Date(`${view.deadline}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long" })
    : null;

  const setCount = (n: number) => {
    const count = Math.max(1, Math.min(view.maxParty, n));
    setParty((p) => (count > p.length ? [...p, ...Array.from({ length: count - p.length }, () => "")] : p.slice(0, count)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (attending === null) return;
    setSaving(true);
    setError(null);
    setBadIndex(null);
    try {
      const res = await apiFetch<InviteViewDto & { token: string }>(`/api/invite/${encodeURIComponent(token)}`, {
        method: "POST",
        json: {
          attending,
          name: view.kind === "open" ? name : null,
          party: attending ? party : [],
          dietary: attending ? dietary : null,
          message,
        },
      });
      setEditing(false);
      if (res.token !== token) {
        // Open link: the reply now lives on the guest's own link.
        router.replace(`/d/${res.token}`);
        return;
      }
      fill(res);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.details) {
        const key = Object.keys(err.details).find((k) => k.startsWith("party."));
        if (key) setBadIndex(Number(key.split(".")[1]));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-dvh bg-stone-100 px-4 py-8 sm:py-14" style={{ "--accent": accent } as React.CSSProperties}>
      <div className="mx-auto mb-4 flex max-w-md justify-end">
        <LanguageSwitcher />
      </div>
      <InvitationCard design={view.design} event={view.event} greeting={greeting} />

      <section className="mx-auto mt-6 w-full max-w-md rounded-[2rem] border border-stone-200 bg-white p-6 sm:p-8">
        {!showForm && view.reply ? (
          <div className="text-center">
            {view.reply.status === "yes" ? (
              <CheckCircle2 className="mx-auto h-9 w-9" style={{ color: accent }} />
            ) : (
              <XCircle className="mx-auto h-9 w-9 text-stone-400" />
            )}
            <h2 className="mt-3 text-lg font-semibold text-stone-900">
              {view.reply.status === "yes" ? t("Yanıtınız alındı, sizi bekliyoruz!") : t("Yanıtınız alındı. Sizi özleyeceğiz.")}
            </h2>
            {view.reply.status === "yes" && (
              <ul className="mt-4 space-y-1 text-sm text-stone-700">
                {view.reply.party.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
            {view.canReply ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                <Pencil className="h-4 w-4" /> {t("Yanıtımı değiştir")}
              </button>
            ) : (
              <p className="mt-6 text-xs text-stone-500">{t("Yanıt süresi doldu. Değişiklik için etkinlik sahibiyle iletişime geçin.")}</p>
            )}
            {view.kind === "personal" && view.canReply && (
              <p className="mt-3 text-[11px] text-stone-400">{t("Bu bağlantıyı saklayın; yanıtınızı buradan değiştirebilirsiniz.")}</p>
            )}
          </div>
        ) : !view.canReply ? (
          <p className="text-center text-sm text-stone-600">{t("Bu davetiye için yanıt süresi doldu.")}</p>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-stone-900">{t("Katılım durumunuz")}</h2>
              {deadlineText && <p className="mt-1 text-xs text-stone-500">{t("Lütfen {date} tarihine kadar yanıtlayın.", { date: deadlineText })}</p>}
            </div>

            {view.kind === "open" && (
              <label className="block">
                <span className={ui.label}>{t("Adınız ve soyadınız")}</span>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setParty((p) => (p.length && !p[0] ? [e.target.value, ...p.slice(1)] : p));
                  }}
                  maxLength={INVITE_LIMITS.name}
                  required
                  autoComplete="name"
                  className={ui.input}
                />
              </label>
            )}

            <div className="grid grid-cols-2 gap-2">
              {[
                [true, t("Katılıyorum")],
                [false, t("Katılamıyorum")],
              ].map(([value, label]) => {
                const active = attending === value;
                return (
                  <button
                    key={String(value)}
                    type="button"
                    onClick={() => setAttending(value as boolean)}
                    aria-pressed={active}
                    className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${active ? "text-white" : "border-stone-300 text-stone-700 hover:bg-stone-50"}`}
                    style={active ? { backgroundColor: accent, borderColor: accent } : undefined}
                  >
                    {label as string}
                  </button>
                );
              })}
            </div>

            {attending && (
              <>
                {view.maxParty > 1 && (
                  <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3">
                    <span className="text-sm text-stone-700">
                      {t("Kaç kişi geleceksiniz?")} <span className="text-xs text-stone-500">{t("(en fazla {n})", { n: view.maxParty })}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <button type="button" onClick={() => setCount(party.length - 1)} disabled={party.length <= 1} aria-label={t("Azalt")} className="rounded-full border border-stone-300 bg-white p-1.5 disabled:opacity-40">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center font-semibold tabular-nums">{party.length}</span>
                      <button type="button" onClick={() => setCount(party.length + 1)} disabled={party.length >= view.maxParty} aria-label={t("Artır")} className="rounded-full border border-stone-300 bg-white p-1.5 disabled:opacity-40">
                        <Plus className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                )}
                <div className="space-y-2">
                  <span className={ui.label}>{party.length > 1 ? t("Gelecek kişilerin adı ve soyadı") : t("Adınız ve soyadınız")}</span>
                  {party.map((p, i) => (
                    <input
                      key={i}
                      value={p}
                      onChange={(e) => setParty((list) => list.map((v, j) => (j === i ? e.target.value : v)))}
                      maxLength={INVITE_LIMITS.name}
                      required
                      placeholder={i === 0 ? t("Ad Soyad") : t("{n}. kişi – Ad Soyad", { n: i + 1 })}
                      aria-invalid={badIndex === i}
                      className={`${ui.input} ${badIndex === i ? "border-rose-400" : ""}`}
                    />
                  ))}
                </div>
                <label className="block">
                  <span className={ui.label}>{t("Menü tercihi / alerji (isteğe bağlı)")}</span>
                  <input value={dietary} onChange={(e) => setDietary(e.target.value)} maxLength={INVITE_LIMITS.dietary} placeholder={t("Örn. vejetaryen, glutensiz")} className={ui.input} />
                </label>
              </>
            )}

            {attending !== null && (
              <label className="block">
                <span className={ui.label}>{t("Mesajınız (isteğe bağlı)")}</span>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={INVITE_LIMITS.message} rows={3} className={ui.input} />
              </label>
            )}

            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            <div className="flex gap-2">
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    fill(view);
                    setEditing(false);
                  }}
                  className="rounded-2xl border border-stone-300 px-4 py-3 text-sm font-medium text-stone-700"
                >
                  {t("Vazgeç")}
                </button>
              )}
              <button
                type="submit"
                disabled={attending === null || saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("Yanıtımı gönder")}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
