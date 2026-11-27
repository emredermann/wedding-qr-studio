import { Check } from "lucide-react";

import type { MsgKey, Vars } from "@/lib/i18n/translate";

type T = (key: MsgKey, vars?: Vars) => string;

/**
 * Decorative collage for the invitations section: the personal invitation on
 * a phone, the guest's reply and the Drive sheet it lands in. Built from
 * plain markup in the landing fonts (no extra downloads).
 */
export function InviteIllustration({ t }: { t: T }) {
  const rows: Array<[string, string, string]> = [
    ["Ayşe Yılmaz", t("Katılıyor"), "2"],
    ["Yılmaz ailesi", t("Katılıyor"), "4"],
    ["Can Demir", t("Katılmıyor"), "0"],
    ["Deniz Kaya", t("Yanıt bekleniyor"), ""],
  ];
  return (
    <div className="relative mx-auto h-[34rem] w-full max-w-[22rem] sm:max-w-[36rem]" aria-hidden>
      {/* Drive sheet */}
      <div className="absolute top-8 right-0 hidden w-[17.5rem] rotate-[3deg] overflow-hidden sm:block rounded-xl border border-stone-200 bg-white shadow-[0_24px_50px_-28px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-2 border-b border-stone-100 bg-[#eef5ee] px-3 py-2 text-[11px] font-semibold text-[#2f6b3b]">
          <span className="grid h-4 w-4 place-items-center rounded-sm bg-[#2f8f46] text-[8px] text-white">▦</span>
          {t("Davetiye Yanıtları")}
        </div>
        <table className="w-full text-left text-[10px] text-stone-700">
          <tbody>
            <tr className="bg-stone-50 font-semibold text-stone-500">
              <td className="border-r border-b border-stone-100 px-2 py-1.5">{t("Davetli")}</td>
              <td className="border-r border-b border-stone-100 px-2 py-1.5">{t("Yanıt")}</td>
              <td className="border-b border-stone-100 px-2 py-1.5">{t("Kişi")}</td>
            </tr>
            {rows.map(([n, s, c]) => (
              <tr key={n}>
                <td className="border-r border-b border-stone-100 px-2 py-1.5">{n}</td>
                <td className="border-r border-b border-stone-100 px-2 py-1.5">{s}</td>
                <td className="border-b border-stone-100 px-2 py-1.5 tabular-nums">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone with the invitation */}
      <div className="absolute top-0 left-0 w-[15.5rem] -rotate-[4deg] rounded-[2.4rem] bg-stone-900 p-2.5 shadow-[0_40px_70px_-30px_rgba(0,0,0,0.55)]">
        <div className="overflow-hidden rounded-[1.9rem] bg-[#ece6da] px-3 pt-8 pb-5">
          <div className="relative rounded-[14px] bg-[#fbf8f1] px-4 pt-7 pb-6 text-center text-[#2b2620]">
            <div className="pointer-events-none absolute inset-2 rounded-[10px] border border-[#a08452]/60" />
            <p className="font-brand text-[11px] text-stone-500 italic">{t("Sevgili {name},", { name: "Ayşe Yılmaz" })}</p>
            <p className="mt-3 text-[7px] font-semibold tracking-[0.3em] text-[#a08452] uppercase">{t("Evleniyoruz")}</p>
            <p className="mt-1.5 font-brand text-[1.7rem] leading-none">Elif &amp; Kerem</p>
            <div className="mx-auto my-3 h-px w-10 bg-[#a08452]" />
            <p className="text-[10px] font-semibold">20 Aralık 2026</p>
            <p className="text-[9px] text-stone-500">{t("Pazar · 19:00")}</p>
            <p className="mt-2 text-[9px]">Bahçe Restoran</p>
            <div className="mt-3 flex justify-center gap-1.5">
              <span className="rounded-full border border-[#a08452] px-2 py-0.5 text-[8px] text-[#a08452]">{t("Yol tarifi")}</span>
              <span className="rounded-full border border-[#a08452] px-2 py-0.5 text-[8px] text-[#a08452]">{t("Takvime ekle")}</span>
            </div>
          </div>
          <div className="mt-3 rounded-[14px] bg-white p-3 text-center">
            <p className="text-[10px] font-semibold text-stone-800">{t("Katılım durumunuz")}</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[9px] font-semibold">
              <span className="rounded-lg bg-[#a08452] py-1.5 text-white">{t("Katılıyorum")}</span>
              <span className="rounded-lg border border-stone-300 py-1.5 text-stone-600">{t("Katılamıyorum")}</span>
            </div>
            <p className="mt-2 rounded-md border border-stone-200 px-2 py-1 text-left text-[9px] text-stone-700">Ayşe Yılmaz</p>
            <p className="mt-1 rounded-md border border-stone-200 px-2 py-1 text-left text-[9px] text-stone-700">Can Yılmaz</p>
          </div>
        </div>
      </div>

      {/* Reply notification */}
      <div className="absolute right-0 bottom-10 flex w-[17rem] sm:right-4 items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-[0_24px_50px_-28px_rgba(0,0,0,0.45)]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700">
          <Check className="h-4 w-4" />
        </span>
        <div className="min-w-0 text-xs">
          <p className="font-semibold text-stone-900">{t("Yeni yanıt: Ayşe Yılmaz")}</p>
          <p className="text-stone-500">{t("2 kişi katılıyor · Masa 4’e eklendi")}</p>
        </div>
      </div>
    </div>
  );
}

/** A static miniature of the seating planner (decorative). */
export function SeatingIllustration({ t }: { t: T }) {
  const round = (cx: number, cy: number, label: string, filled: number) => (
    <g key={label} transform={`translate(${cx} ${cy})`}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const on = i < filled;
        return (
          <circle
            key={i}
            cx={Math.cos(a) * 52}
            cy={Math.sin(a) * 52}
            r={11}
            fill={on ? "#2c2a26" : "#fff"}
            stroke={on ? "#2c2a26" : "#a19c92"}
            strokeWidth={1.5}
            strokeDasharray={on ? undefined : "3 3"}
          />
        );
      })}
      <circle r={36} fill="#fff" stroke="#a19c92" strokeWidth={2} />
      <text textAnchor="middle" y={4} fontSize={12} fontWeight={600} fill="#2c2a26">
        {label}
      </text>
    </g>
  );
  const masa = t("Masa");
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm" aria-hidden>
      <svg viewBox="0 0 520 400" className="h-auto w-full">
        <defs>
          <pattern id="landing-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#efeae0" strokeWidth={1} />
          </pattern>
          <pattern id="landing-dance" width="24" height="24" patternUnits="userSpaceOnUse">
            <rect width="24" height="24" fill="#f8f6f1" />
            <rect width="12" height="12" fill="#efeae0" />
            <rect x="12" y="12" width="12" height="12" fill="#efeae0" />
          </pattern>
        </defs>
        <rect width="520" height="400" rx="16" fill="#fbfaf7" />
        <rect width="520" height="400" rx="16" fill="url(#landing-grid)" />
        {/* head table */}
        <g transform="translate(260 52)">
          {[-75, -25, 25, 75].map((x) => (
            <circle key={x} cx={x} cy={-24} r={11} fill="#2c2a26" />
          ))}
          <rect x={-110} y={-12} width={220} height={34} rx={8} fill="#fff" stroke="#a19c92" strokeWidth={2} />
          <text textAnchor="middle" y={9} fontSize={12} fontWeight={600} fill="#2c2a26">
            {t("Baş masa")}
          </text>
        </g>
        {/* dance floor */}
        <rect x={190} y={150} width={140} height={110} rx={4} fill="url(#landing-dance)" stroke="#b09d7d" strokeWidth={2} />
        <text x={260} y={210} textAnchor="middle" fontSize={12} fontWeight={600} letterSpacing="0.08em" fill="#5a564f">
          {t("Dans pisti").toLocaleUpperCase("tr-TR")}
        </text>
        {round(95, 170, `${masa} 1`, 8)}
        {round(95, 315, `${masa} 2`, 5)}
        {round(425, 170, `${masa} 3`, 7)}
        {round(425, 315, `${masa} 4`, 3)}
        {round(260, 330, `${masa} 5`, 6)}
      </svg>
    </div>
  );
}
