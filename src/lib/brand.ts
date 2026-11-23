/** Single source of truth for the product's name, voice and brand colours. */
export const BRAND = {
  name: "Mira",
  tagline: "mīrus / mīra : Hayranlık uyandıran, harika, olağanüstü ve mucizevi.",
  description:
    "Düğün, kurumsal etkinlik, doğum günü ya da festival: misafirleriniz QR kodu okutur; fotoğraf, video ve mesajlarını uygulama indirmeden orijinal kalitede sizin Google Drive’ınıza bırakır. Yüz tanıma, canlı ekran, fotoğraf görevleri, sesli anı defteri ve QR kart tasarlayıcı — hepsi ücretsiz.",
  colors: {
    ink: "#1C1B18",
    ivory: "#F7F5F0",
    bronze: "#7F6D51",
  },
  /** Default accent for new events' guest pages (quiet ink; AA contrast with white text). */
  defaultEventColor: "#1f1d1a",
  /** Folder created in each connected Google Drive. */
  driveFolderName: "Mira",
} as const;
