/** Single source of truth for the product's name, voice and brand colours. */
export const BRAND = {
  name: "Mira",
  tagline: "Anların zarif arşivi.",
  description:
    "Misafirleriniz QR kodu okutur; fotoğraf, video ve mesajlarını uygulama indirmeden orijinal kalitede sizin Google Drive’ınıza bırakır. Yüz tanıma, canlı ekran, sesli anı defteri ve masa kartı tasarlayıcı — hepsi ücretsiz.",
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
