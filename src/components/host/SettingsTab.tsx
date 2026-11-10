"use client";

import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { trackEvent } from "@/lib/client/analytics";
import { apiFetch, errorMessage } from "@/lib/client/api";
import type { HostEventDto } from "@/types/domain";

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
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch<{ event: HostEventDto }>(`/api/host/events/${event.id}`, { method: "PATCH", json: form });
      trackEvent("settings_saved");
      onSaved(res.event);
      onMessage("Ayarlar kaydedildi.", "success");
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
    const answer = window.prompt(`Etkinliği silmek için bağlantı adresini yazın: ${event.slug}`);
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

  const field = "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-stone-500";
  const toggles: Array<[keyof typeof form, string, string]> = [
    ["uploadsEnabled", "Misafir yüklemeleri açık", "Kapatırsanız misafirler sadece galeriyi görür."],
    ["requireApproval", "Yayından önce onay iste", "Yeni fotoğraf ve mesajlar siz onaylayana kadar gizli kalır."],
    ["galleryPublic", "Galeri misafirlere açık", "Kapalıysa misafirler yalnızca kendi yüklediklerini görür ve “Beni Bul” kapanır."],
    ["faceSearchEnabled", "“Beni Bul” yüz arama", "Yalnızca galeri misafirlere açıkken kullanılır. Yüz vektörleri misafirin tarayıcısında çıkarılır; fotoğraf sunucuya gitmez."],
    ["guestbookEnabled", "Dijital anı defteri", "Yazılı, sesli ve video mesajlar."],
  ];

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4 rounded-3xl border border-stone-200 bg-white p-5">
        <h3 className="font-serif text-lg text-stone-900">Etkinlik bilgileri</h3>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-600">Etkinlik adı</span>
          <input required minLength={2} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={field} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-600">Başlıkta görünecek isim</span>
          <input maxLength={120} value={form.coupleNames} onChange={(e) => setForm({ ...form, coupleNames: e.target.value })} className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-600">Tarih</span>
            <input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-stone-600">Tema rengi</span>
            <input type="color" value={form.themeColor} onChange={(e) => setForm({ ...form, themeColor: e.target.value })} className="h-[42px] w-full cursor-pointer rounded-xl border border-stone-300 bg-white p-1" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-stone-600">Karşılama mesajı</span>
          <textarea maxLength={500} rows={3} value={form.welcomeMessage} onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })} className={field} />
        </label>
        <div>
          <span className="mb-1 block text-xs font-semibold text-stone-600">Albüm kategorileri</span>
          <div className="mb-2 flex flex-wrap gap-2">
            {form.categories.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full bg-stone-100 py-1 pr-1 pl-3 text-xs text-stone-800">
                {c}
                <button type="button" onClick={() => setForm({ ...form, categories: form.categories.filter((x) => x !== c) })} className="rounded-full p-0.5 hover:bg-stone-200" aria-label={`${c} kaldır`}>
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
              placeholder="ör. Masa 1, Sahne, Sunum, After Party"
              className={field}
            />
            <button type="button" onClick={addCategory} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-stone-300 px-3 text-sm">
              <Plus className="h-4 w-4" /> Ekle
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1 rounded-3xl border border-stone-200 bg-white p-5">
          <h3 className="mb-2 font-serif text-lg text-stone-900">Özellikler & moderasyon</h3>
          {toggles.map(([key, label, hint]) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-stone-50">
              <input type="checkbox" checked={Boolean(form[key])} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} className="mt-0.5 h-5 w-5 accent-stone-900" />
              <span>
                <span className="block text-sm font-medium text-stone-900">{label}</span>
                <span className="block text-xs text-stone-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        <button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Kaydet
        </button>
        <div className="rounded-3xl border border-rose-200 bg-rose-50/60 p-5">
          <h3 className="text-sm font-semibold text-rose-800">Etkinliği sil</h3>
          <p className="mt-1 text-xs text-rose-700">Etkinlik kaydı silinir; Drive klasörü çöp kutusuna taşınır ve 30 gün içinde geri alınabilir.</p>
          <button type="button" onClick={deleteEvent} disabled={deleting} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold text-white">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Etkinliği sil
          </button>
        </div>
      </section>
    </form>
  );
}
