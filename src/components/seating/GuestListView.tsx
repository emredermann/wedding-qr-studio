"use client";

import { ClipboardList, Download, FileSpreadsheet, Loader2, Search, Sparkles, Trash2, Upload, UserPlus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { readGuestFile } from "@/components/seating/guestImport";
import { RSVP_LABEL } from "@/components/seating/labels";
import { downloadBlob, guestsCsv, safeFileName } from "@/components/seating/exportPlan";
import type { SeatingStore } from "@/components/seating/useSeatingStore";
import { useModalAccessibility } from "@/components/ui/Feedback";
import { ui } from "@/components/ui/styles";
import { apiFetch, errorMessage } from "@/lib/client/api";
import { useLang, useT } from "@/lib/i18n/provider";
import { translateLoose } from "@/lib/i18n/translate";
import type { ImportResult } from "@/lib/seating/import";
import { addGuests, newNames, parseGuestLines, removeGuests, unassignGuest, updateGuest, type GuestInput } from "@/lib/seating/ops";
import { RSVP_STATES, SEATING_LIMITS, type Rsvp, type SeatingPlan } from "@/lib/seating/schema";
import type { GuestListDto } from "@/types/domain";

type Notify = (text: string, variant?: "success" | "error" | "info") => void;

type Preview = { fileName: string; result: ImportResult; skipDuplicates: boolean };

const cellInput = "w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none hover:border-stone-200 focus:border-stone-400 focus:bg-white";

/**
 * Spreadsheet-like guest list: inline editing, bulk paste, Excel / CSV / PDF
 * import with a preview, "import from Mira guests" and CSV export.
 */
export function GuestListView({ plan, store, eventId, eventName, notify }: { plan: SeatingPlan; store: Pick<SeatingStore, "apply">; eventId: string; eventName: string; notify: Notify }) {
  const t = useT();
  const { lang } = useLang();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"file" | "mira" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tableName = useMemo(() => new Map(plan.tables.map((x) => [x.id, x.name])), [plan.tables]);
  const groups = useMemo(() => [...new Set(plan.guests.map((g) => g.group).filter((g): g is string => Boolean(g)))], [plan.guests]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return plan.guests;
    return plan.guests.filter((g) => `${g.name} ${g.group ?? ""} ${g.dietary ?? ""} ${g.note ?? ""}`.toLocaleLowerCase("tr-TR").includes(q));
  }, [plan.guests, query]);
  const liveSelected = useMemo(() => new Set([...selected].filter((id) => plan.guests.some((g) => g.id === id))), [selected, plan.guests]);
  const room = SEATING_LIMITS.guests - plan.guests.length;

  const add = (inputs: GuestInput[], skipDuplicates: boolean): number => {
    let list = inputs;
    if (skipDuplicates) {
      const keep = new Set(newNames(plan, inputs.map((i) => i.name)).map((n) => n.toLocaleLowerCase("tr-TR")));
      list = inputs.filter((i) => {
        const key = i.name.trim().toLocaleLowerCase("tr-TR");
        if (!keep.has(key)) return false;
        keep.delete(key);
        return true;
      });
    }
    const n = Math.min(list.length, Math.max(0, room));
    if (n > 0) store.apply((pl) => addGuests(pl, list));
    if (list.length > n) notify(t("Misafir sınırına ulaşıldı ({n}).", { n: SEATING_LIMITS.guests }), "error");
    return n;
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy("file");
    try {
      const result = await readGuestFile(file);
      setPreview({ fileName: file.name, result, skipDuplicates: true });
    } catch (error) {
      notify(translateLoose(error instanceof Error ? error.message : String(error), lang), "error");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const importFromMira = async () => {
    setBusy("mira");
    try {
      const res = await apiFetch<GuestListDto>(`/api/host/events/${eventId}/guests`);
      const names = newNames(plan, res.guests.map((g) => g.name));
      if (names.length === 0) {
        notify(t("Eklenecek yeni isim yok."), "info");
        return;
      }
      const n = add(names.map((name) => ({ name })), false);
      notify(t("{n} misafir eklendi.", { n }), "success");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    const header = [t("Ad Soyad"), t("Grup"), t("Diyet"), t("Katılım"), t("Masa"), t("Sandalye"), t("Not")];
    downloadBlob(guestsCsv(plan, header, (r) => t(RSVP_LABEL[r])), `${safeFileName(eventName)}-${t("misafirler")}.csv`);
  };

  const allVisibleSelected = visible.length > 0 && visible.every((g) => liveSelected.has(g.id));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((g) => g.id)));

  const btn = "inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Misafir ara")} aria-label={t("Misafir ara")} className={`${ui.input} pl-9`} />
          </div>
          <button type="button" className={btn} onClick={() => add([{ name: t("Yeni misafir") }], false)} disabled={room <= 0}>
            <UserPlus className="h-4 w-4" /> {t("Misafir ekle")}
          </button>
          <button type="button" className={btn} onClick={() => setPasteOpen(true)} disabled={room <= 0}>
            <ClipboardList className="h-4 w-4" /> {t("Liste yapıştır")}
          </button>
          <button type="button" className={btn} onClick={() => fileRef.current?.click()} disabled={room <= 0 || busy !== null}>
            {busy === "file" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {t("Excel / PDF içe aktar")}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt,.pdf,application/pdf" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <button type="button" className={btn} onClick={() => void importFromMira()} disabled={room <= 0 || busy !== null} title={t("Fotoğraf yükleyen ve anı defterine yazan misafirlerin adları")}>
            {busy === "mira" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {t("Mira misafirlerinden ekle")}
          </button>
          <button type="button" className={btn} onClick={exportCsv} disabled={plan.guests.length === 0}>
            <Download className="h-4 w-4" /> {t("CSV indir")}
          </button>
        </div>

        <p className={ui.hint}>
          {t("Excel (.xlsx), CSV veya tablo içeren PDF yükleyebilirsiniz. “Ad Soyad”, “Grup”, “Diyet”, “Katılım” ve “Not” başlıkları otomatik tanınır; başlık yoksa ilk sütun isim kabul edilir.")}
        </p>

        {liveSelected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-stone-900 px-4 py-2.5 text-sm text-white">
            <span>{t("{n} misafir seçili", { n: liveSelected.size })}</span>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-white/10"
              onClick={() => store.apply((pl) => [...liveSelected].reduce((acc, id) => unassignGuest(acc, id), pl))}
            >
              {t("Masadan kaldır")}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-red-300 hover:bg-white/10"
              onClick={() => {
                if (!window.confirm(t("{n} misafir silinsin mi?", { n: liveSelected.size }))) return;
                store.apply((pl) => removeGuests(pl, [...liveSelected]));
                setSelected(new Set());
              }}
            >
              <Trash2 className="h-4 w-4" /> {t("Sil")}
            </button>
            <button type="button" className="ml-auto rounded-lg p-1 hover:bg-white/10" onClick={() => setSelected(new Set())} aria-label={t("Seçimi temizle")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {plan.guests.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <FileSpreadsheet className="mx-auto h-8 w-8 text-stone-400" />
            <p className="mt-3 text-sm font-semibold text-stone-900">{t("Davetli listenizi ekleyin")}</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-stone-500">
              {t("Excel veya PDF listenizi içe aktarın, isimleri yapıştırın ya da tek tek ekleyin. Sonra Oturma Düzeni'nde masalara yerleştirin.")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-stone-200 bg-white">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs font-semibold text-stone-600">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input type="checkbox" className={ui.checkbox} checked={allVisibleSelected} onChange={toggleAll} aria-label={t("Tümünü seç")} />
                  </th>
                  <th className="min-w-48 px-2 py-2.5">{t("Ad Soyad")}</th>
                  <th className="w-40 px-2 py-2.5">{t("Grup")}</th>
                  <th className="w-40 px-2 py-2.5">{t("Diyet")}</th>
                  <th className="w-40 px-2 py-2.5">{t("Katılım")}</th>
                  <th className="w-36 px-2 py-2.5">{t("Masa")}</th>
                  <th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visible.map((g) => (
                  <tr key={g.id} className={liveSelected.has(g.id) ? "bg-amber-50/60" : ""}>
                    <td className="px-3 py-1">
                      <input
                        type="checkbox"
                        className={ui.checkbox}
                        checked={liveSelected.has(g.id)}
                        aria-label={g.name}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(g.id)) next.delete(g.id);
                            else next.add(g.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="px-1 py-1">
                      <CellInput value={g.name} label={t("Ad Soyad")} onCommit={(v) => v.trim() && store.apply((pl) => updateGuest(pl, g.id, { name: v }))} />
                    </td>
                    <td className="px-1 py-1">
                      <CellInput value={g.group ?? ""} label={t("Grup")} list="seating-groups" onCommit={(v) => store.apply((pl) => updateGuest(pl, g.id, { group: v }))} />
                    </td>
                    <td className="px-1 py-1">
                      <CellInput value={g.dietary ?? ""} label={t("Diyet")} onCommit={(v) => store.apply((pl) => updateGuest(pl, g.id, { dietary: v }))} />
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={g.rsvp}
                        aria-label={t("Katılım")}
                        onChange={(e) => store.apply((pl) => updateGuest(pl, g.id, { rsvp: e.target.value as Rsvp }))}
                        className={`${cellInput} ${g.rsvp === "yes" ? "text-emerald-700" : g.rsvp === "no" ? "text-red-700" : "text-stone-600"}`}
                      >
                        {RSVP_STATES.map((r) => (
                          <option key={r} value={r}>
                            {t(RSVP_LABEL[r])}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1 text-xs text-stone-600">
                      {g.seat ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1">
                          {tableName.get(g.seat.tableId) || t("Masa")} · {g.seat.seat + 1}
                          <button type="button" onClick={() => store.apply((pl) => unassignGuest(pl, g.id))} aria-label={t("Masadan kaldır")} className="text-stone-400 hover:text-stone-800">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <button type="button" onClick={() => store.apply((pl) => removeGuests(pl, [g.id]))} aria-label={t("Sil")} className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="seating-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <p className="border-t border-stone-100 px-4 py-2.5 text-xs text-stone-500">
              {t("{n} / {max} misafir", { n: plan.guests.length, max: SEATING_LIMITS.guests })}
            </p>
          </div>
        )}
      </div>

      {pasteOpen && (
        <Dialog title={t("Liste yapıştır")} onClose={() => setPasteOpen(false)}>
          <p className={ui.hint}>{t("Her satıra bir misafir. İsterseniz “Ad Soyad, Grup, Diyet” şeklinde ya da Excel'den kopyalayarak yapıştırın.")}</p>
          <textarea
            autoFocus
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={10}
            className={`${ui.input} mt-3 font-mono`}
            placeholder={t("Ayşe Yılmaz, Aile\nMehmet Demir, İş arkadaşları, Vejetaryen")}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={btn} onClick={() => setPasteOpen(false)}>
              {t("Vazgeç")}
            </button>
            <button
              type="button"
              disabled={!pasteText.trim()}
              className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => {
                const n = add(parseGuestLines(pasteText), false);
                notify(t("{n} misafir eklendi.", { n }), "success");
                setPasteText("");
                setPasteOpen(false);
              }}
            >
              {t("Ekle")}
            </button>
          </div>
        </Dialog>
      )}

      {preview && (
        <ImportPreview
          preview={preview}
          plan={plan}
          onChange={setPreview}
          onClose={() => setPreview(null)}
          onConfirm={() => {
            const n = add(preview.result.guests, preview.skipDuplicates);
            notify(n > 0 ? t("{n} misafir eklendi.", { n }) : t("Eklenecek yeni isim yok."), n > 0 ? "success" : "info");
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}

/** Text cell that commits on blur / Enter. Keyed by value so undo refreshes it. */
function CellInput({ value, label, list, onCommit }: { value: string; label: string; list?: string; onCommit: (value: string) => void }) {
  return (
    <input
      key={value}
      defaultValue={value}
      aria-label={label}
      list={list}
      maxLength={80}
      className={cellInput}
      onBlur={(e) => {
        if (e.target.value !== value) onCommit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          (e.target as HTMLInputElement).value = value;
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useModalAccessibility({ isOpen: true, onClose, containerRef: ref });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className={ui.sectionTitle}>{title}</h2>
          <button type="button" onClick={onClose} aria-label={t("Kapat")} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ImportPreview({
  preview,
  plan,
  onChange,
  onClose,
  onConfirm,
}: {
  preview: Preview;
  plan: SeatingPlan;
  onChange: (p: Preview) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useT();
  const { guests, columns, headerRow } = preview.result;
  const fresh = useMemo(() => newNames(plan, guests.map((g) => g.name)).length, [plan, guests]);
  const duplicates = guests.length - fresh;
  const count = preview.skipDuplicates ? fresh : guests.length;
  const detected = (
    [
      ["name", t("Ad Soyad")],
      ["first", t("Ad")],
      ["last", t("Soyad")],
      ["group", t("Grup")],
      ["dietary", t("Diyet")],
      ["rsvp", t("Katılım")],
      ["note", t("Not")],
    ] as const
  )
    .filter(([key]) => columns[key] !== undefined)
    .map(([, label]) => label);
  const shown = guests.slice(0, 100);

  return (
    <Dialog title={t("İçe aktarma önizlemesi")} onClose={onClose} wide>
      <p className="truncate text-sm text-stone-700">
        <span className="font-semibold">{preview.fileName}</span> · {t("{n} misafir bulundu", { n: guests.length })}
      </p>
      <p className={`${ui.hint} mt-1`}>
        {headerRow ? t("Tanınan sütunlar: {cols}", { cols: detected.join(", ") }) : t("Başlık satırı bulunamadı: 1. sütun isim, 2. grup, 3. diyet olarak okundu.")}
      </p>
      <div className="mt-3 max-h-72 overflow-auto rounded-2xl border border-stone-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-stone-50 text-stone-600">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">{t("Ad Soyad")}</th>
              <th className="px-3 py-2">{t("Grup")}</th>
              <th className="px-3 py-2">{t("Diyet")}</th>
              <th className="px-3 py-2">{t("Katılım")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {shown.map((g, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5 text-stone-400 tabular-nums">{i + 1}</td>
                <td className="px-3 py-1.5 text-stone-900">{g.name}</td>
                <td className="px-3 py-1.5 text-stone-600">{g.group}</td>
                <td className="px-3 py-1.5 text-stone-600">{g.dietary}</td>
                <td className="px-3 py-1.5 text-stone-600">{t(RSVP_LABEL[g.rsvp ?? "pending"])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {guests.length > shown.length && <p className="px-3 py-2 text-xs text-stone-500">{t("… ve {n} misafir daha", { n: guests.length - shown.length })}</p>}
      </div>
      {duplicates > 0 && (
        <label className="mt-3 flex items-center gap-2.5 text-sm text-stone-700">
          <input type="checkbox" className={ui.checkbox} checked={preview.skipDuplicates} onChange={(e) => onChange({ ...preview, skipDuplicates: e.target.checked })} />
          {t("Listede zaten olan {n} ismi atla", { n: duplicates })}
        </label>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50" onClick={onClose}>
          {t("Vazgeç")}
        </button>
        <button type="button" disabled={count === 0} className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={onConfirm}>
          {t("{n} misafiri ekle", { n: count })}
        </button>
      </div>
    </Dialog>
  );
}
