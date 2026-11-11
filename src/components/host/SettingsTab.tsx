"use client";

import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CoHostsCard } from "@/components/host/CoHostsCard";
import { ChallengesEditor, ScheduleEditor } from "@/components/host/EventExtrasEditors";
import { trackEvent } from "@/lib/client/analytics";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { HostEventDto } from "@/types/domain";
import { useT } from "@/lib/i18n/provider";
import type { MsgKey } from "@/lib/i18n/translate";
import { ui } from "@/components/ui/styles";
import { ToggleRow } from "@/components/ui/ToggleRow";

export function SettingsTab({
  event,
  onSaved,
  onMessage,
}: {
  event: HostEventDto;
  onSaved: (event: HostEventDto) => void;
  onMessage: (text: string, variant?: "success" | "error" | "info") => void;
}) {
  const router = useRouter();
  const t = useT();
  const [form, setForm] = useState({
    title: event.title,
    coupleNames: event.coupleNames ?? "",
    eventDate: event.eventDate ?? "",
    welcomeMessage: event.welcomeMessage ?? "",
    themeColor: event.themeColor,
    categories: event.categories,
    uploadsEnabled: event.uploadsEnabled,
    requireApproval: event.requireApproval,
    galleryPublic: event.galleryPublic,
    faceSearchEnabled: event.faceSearchEnabled,
    guestbookEnabled: event.guestbookEnabled,
  });
  const [schedule, setSchedule] = useState(event.schedule);
  const [challenges, setChallenges] = useState(event.challenges);
  const [heartsNamed, setHeartsNamed] = useState(event.heartsNamed);
  const [tableNumbers, setTableNumbers] = useState(event.tableNumbers);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Optional extras are only sent when they changed, so saving the other
      // settings never touches them.
      const scheduleChanged = JSON.stringify(schedule) !== JSON.stringify(event.schedule);
      const challengesChanged = JSON.stringify(challenges) !== JSON.stringify(event.challenges);
      const heartsNamedChanged = heartsNamed !== event.heartsNamed;
      const tableNumbersChanged = tableNumbers !== event.tableNumbers;
      const res = await apiFetch<{ event: HostEventDto }>(`/api/host/events/${event.id}`, {
        method: "PATCH",
        json: {
          ...form,
          ...(scheduleChanged ? { schedule } : {}),
          ...(challengesChanged ? { challenges } : {}),
          ...(heartsNamedChanged ? { heartsNamed } : {}),
          ...(tableNumbersChanged ? { tableNumbers } : {}),
        },
      });
      setSchedule(res.event.schedule);
      setChallenges(res.event.challenges);
      setHeartsNamed(res.event.heartsNamed);
      setTableNumbers(res.event.tableNumbers);
      trackEvent("settings_saved");
      onSaved(res.event);
      onMessage(t("Ayarlar kaydedildi."), "success");
    } catch (error) {
      onMessage(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  const addCategory = () => {
    const value = newCategory.trim().slice(0, 40);
    if (!value || form.categories.includes(value) || form.categories.length >= 30) return;
    setForm({ ...form, categories: [...form.categories, value] });
    setNewCategory("");
  };

  const deleteEvent = async () => {
    const answer = window.prompt(t("Etkinliği silmek için bağlantı adresini yazın: {slug}", { slug: event.slug }));
    if (answer !== event.slug) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/host/events/${event.id}`, { method: "DELETE" });
      router.replace("/dashboard");
    } catch (error) {
      onMessage(errorMessage(error), "error");
      setDeleting(false);
    }
  };

  const field = ui.input;
  const toggles: Array<[keyof typeof form, MsgKey, MsgKey]> = [
    ["uploadsEnabled", "Misafir yüklemeleri açık", "Kapatırsanız misafirler sadece galeriyi görür."],
    ["requireApproval", "Yayından önce onay iste", "Yeni fotoğraf ve mesajlar siz onaylayana kadar gizli kalır."],
    ["galleryPublic", "Galeri misafirlere açık", "Kapalıysa misafirler yalnızca kendi yüklediklerini görür ve “Beni Bul” kapanır."],
    ["faceSearchEnabled", "“Beni Bul” yüz arama", "Yalnızca galeri misafirlere açıkken kullanılır. Yüz vektörleri misafirin tarayıcısında çıkarılır; fotoğraf sunucuya gitmez."],
    ["guestbookEnabled", "Dijital anı defteri", "Yazılı, sesli ve video mesajlar."],
  ];

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-2">
      <section className={`space-y-4 ${ui.card}`}>
        <h3 className={ui.sectionTitle}>{t("Etkinlik bilgileri")}</h3>
        <label className="block">
          <span className={ui.label}>{t("Etkinlik adı")}</span>
          <input required minLength={2} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={field} />
        </label>
        <label className="block">
          <span className={ui.label}>{t("Başlıkta görünecek isim")}</span>
          <input maxLength={120} value={form.coupleNames} onChange={(e) => setForm({ ...form, coupleNames: e.target.value })} className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={ui.label}>{t("Tarih")}</span>
            <input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} className={field} />
          </label>
          <label className="block">
            <span className={ui.label}>{t("Tema rengi")}</span>
            <input type="color" value={form.themeColor} onChange={(e) => setForm({ ...form, themeColor: e.target.value })} className="h-[42px] w-full cursor-pointer rounded-xl border border-stone-300 bg-white p-1" />
          </label>
        </div>
        <label className="block">
          <span className={ui.label}>{t("Karşılama mesajı")}</span>
          <textarea maxLength={500} rows={3} value={form.welcomeMessage} onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })} className={field} />
        </label>
        <div>
          <span className={ui.label}>{t("Albüm kategorileri")}</span>
          <div className="mb-2 flex flex-wrap gap-2">
            {form.categories.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-stone-100 py-1 pr-1 pl-3 text-xs text-stone-800">
                {c}
                <button type="button" onClick={() => setForm({ ...form, categories: form.categories.filter((x) => x !== c) })} className="rounded-full p-0.5 hover:bg-stone-200" aria-label={t("{name} kaldır", { name: c })}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newCategory}
              maxLength={40}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCategory();
                }
              }}
              placeholder={t("ör. Masa 1, Sahne, Sunum, After Party")}
              className={field}
            />
            <button type="button" onClick={addCategory} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-stone-300 px-3 text-sm">
              <Plus className="h-4 w-4" /> {t("Ekle")}
            </button>
          </div>
        </div>
        <div>
          <span className={ui.label}>{t("Program akışı (isteğe bağlı)")}</span>
          <p className={`mb-2 ${ui.hint}`}>{t("Misafir sayfasında görünür; etkinlik günü şu anki ve sıradaki madde vurgulanır.")}</p>
          <ScheduleEditor value={schedule} onChange={setSchedule} categories={form.categories} />
        </div>
        <div>
          <span className={ui.label}>{t("Fotoğraf görevleri (isteğe bağlı)")}</span>
          <p className={`mb-2 ${ui.hint}`}>{t("Bir görevi kaldırırsanız ona katılan fotoğraflar silinmez, yalnızca görev etiketi görünmez olur.")}</p>
          <ChallengesEditor value={challenges} onChange={setChallenges} />
        </div>
      </section>

      <section className="space-y-4">
        <div className={`space-y-1 ${ui.card}`}>
          <h3 className={`mb-2 ${ui.sectionTitle}`}>{t("Özellikler & moderasyon")}</h3>
          {toggles.map(([key, label, hint]) => (
            <ToggleRow key={key} checked={Boolean(form[key])} onChange={(checked) => setForm({ ...form, [key]: checked })} label={t(label)} hint={t(hint)} />
          ))}
          <ToggleRow
            checked={heartsNamed}
            onChange={setHeartsNamed}
            label={t("Beğenenlerin adını göster")}
            hint={t("Açıksa bir fotoğrafa kimlerin kalp bıraktığını Medya sekmesinde görürsünüz. Kapalıyken beğeniler anonim görünür. Bu ayar kapalıyken bırakılan kalplerin adları, sonradan açsanız da gösterilmez.")}
          />
          <ToggleRow
            checked={tableNumbers}
            onChange={setTableNumbers}
            label={t("Masa numaraları")}
            hint={t("Açıksa her masanın kartına o masanın numarasını taşıyan ayrı bir QR basılır; yüklemeler masa numarasıyla kaydedilir ve galeride masaya göre filtrelenebilir. Kapalıysa tüm kartlarda aynı QR kullanılır.")}
          />
        </div>
        <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} {t("Kaydet")}
        </button>
        {event.role === "owner" && <CoHostsCard eventId={event.id} onMessage={onMessage} />}
        {event.role === "owner" && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50/60 p-5">
            <h3 className="text-sm font-semibold text-rose-800">{t("Etkinliği sil")}</h3>
            <p className="mt-1 text-xs text-rose-700">{t("Etkinlik kaydı silinir; Drive klasörü çöp kutusuna taşınır ve 30 gün içinde geri alınabilir.")}</p>
            <button type="button" onClick={deleteEvent} disabled={deleting} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white">
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} {t("Etkinliği sil")}
            </button>
          </div>
        )}
      </section>
    </form>
  );
}
