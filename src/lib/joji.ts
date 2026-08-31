/**
 * JOJI domain constants and offline clinical calculators.
 * Pure functions only — safe to import on client and server.
 */

export const PATIENT_LANGUAGES = [
  { code: "yo", label: "Yorùbá" },
  { code: "ig", label: "Igbo" },
  { code: "ha", label: "Hausa" },
  { code: "pcm", label: "Nigerian Pidgin" },
] as const;

export type PatientLanguageCode = (typeof PATIENT_LANGUAGES)[number]["code"];

export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  yo: "Yorùbá",
  ig: "Igbo",
  ha: "Hausa",
  pcm: "Nigerian Pidgin",
};

/** BCP-47 tags used for Web Speech recognition / synthesis. Nigerian languages
 *  fall back to en-NG where the browser has no dedicated voice. */
export const SPEECH_LOCALES: Record<string, string> = {
  en: "en-NG",
  yo: "yo-NG",
  ig: "ig-NG",
  ha: "ha-NG",
  pcm: "en-NG",
};

export const ORG_TYPES = ["Hospital", "NGO", "Pharma/CRO", "Government", "Other"] as const;

/** Best-effort emergency phrase detection across supported languages. */
const EMERGENCY_TERMS = [
  // English
  "chest pain",
  "can't breathe",
  "cannot breathe",
  "not breathing",
  "bleeding heavily",
  "unconscious",
  "suicide",
  "kill myself",
  "seizure",
  "convulsion",
  "stroke",
  // Yorùbá
  "àyà mi ń dùn",
  "aya mi n dun",
  "mi ò lè mí",
  "mi o le mi",
  "ẹ̀jẹ̀ ń jáde",
  "eje n jade",
  // Igbo
  "obi na-egbu",
  "enweghị ike iku ume",
  "enweghi ike iku ume",
  "ọbara na-agba",
  "obara na-agba",
  // Hausa
  "ciwon kirji",
  "ba na iya numfashi",
  "jini yana zuba",
  "suma",
  // Pidgin
  "my chest dey pain",
  "i no fit breathe",
  "blood dey rush",
  "i wan kill myself",
];

export function detectEmergency(text: string): boolean {
  const t = text.toLowerCase();
  return EMERGENCY_TERMS.some((term) => t.includes(term));
}

/* ---------------------------------- dates --------------------------------- */

const DAY = 86_400_000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY);
}

export function formatDate(date: Date) {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Naegele's rule: EDD = LMP + 280 days. */
export function pregnancyFromLmp(lmp: Date) {
  const edd = addDays(lmp, 280);
  const days = Math.floor((Date.now() - lmp.getTime()) / DAY);
  const weeks = Math.max(0, Math.floor(days / 7));
  const trimester = weeks < 13 ? "First" : weeks < 28 ? "Second" : "Third";
  return {
    edd,
    weeks,
    daysRemainder: Math.max(0, days % 7),
    trimester,
    daysToDue: Math.round((edd.getTime() - Date.now()) / DAY),
  };
}

export function postpartumFromBirth(birth: Date) {
  const days = Math.max(0, Math.floor((Date.now() - birth.getTime()) / DAY));
  const weeks = Math.floor(days / 7);
  const stage =
    days <= 1
      ? "Immediate (first 24 hours)"
      : weeks < 6
        ? "Early (up to 6 weeks)"
        : weeks < 26
          ? "Extended (6 weeks – 6 months)"
          : "Late (beyond 6 months)";
  return { days, weeks, stage };
}

export type Vaccine = { name: string; protects: string; offsetWeeks: number };

/** Nigeria NPHCDA routine immunisation schedule (simplified). */
export const NPHCDA_SCHEDULE: Vaccine[] = [
  {
    name: "BCG, OPV 0, Hepatitis B 0",
    protects: "Tuberculosis, polio, hepatitis B",
    offsetWeeks: 0,
  },
  {
    name: "Pentavalent 1, OPV 1, PCV 1, Rotavirus 1",
    protects: "DPT-HepB-Hib, polio, pneumococcus, rotavirus",
    offsetWeeks: 6,
  },
  {
    name: "Pentavalent 2, OPV 2, PCV 2, Rotavirus 2",
    protects: "DPT-HepB-Hib, polio, pneumococcus, rotavirus",
    offsetWeeks: 10,
  },
  {
    name: "Pentavalent 3, OPV 3, PCV 3, IPV",
    protects: "DPT-HepB-Hib, polio, pneumococcus",
    offsetWeeks: 14,
  },
  {
    name: "Vitamin A 1, Malaria vaccine (where available)",
    protects: "Nutrition, malaria",
    offsetWeeks: 26,
  },
  {
    name: "Measles 1, Yellow Fever, Meningitis A",
    protects: "Measles, yellow fever, meningitis",
    offsetWeeks: 39,
  },
  { name: "Measles 2, Vitamin A 2", protects: "Measles, nutrition", offsetWeeks: 65 },
];

export function vaccinationSchedule(dob: Date) {
  const now = Date.now();
  const rows = NPHCDA_SCHEDULE.map((v) => {
    const due = addDays(dob, v.offsetWeeks * 7);
    return { ...v, due, past: due.getTime() < now };
  });
  const nextIndex = rows.findIndex((r) => !r.past);
  return rows.map((r, i) => ({ ...r, next: i === nextIndex }));
}

export function cycleForecast(lastPeriod: Date, cycleLength: number, periodLength: number) {
  const nextPeriod = addDays(lastPeriod, cycleLength);
  const ovulation = addDays(nextPeriod, -14);
  return {
    nextPeriod,
    ovulation,
    fertileStart: addDays(ovulation, -5),
    fertileEnd: addDays(ovulation, 1),
    periodEnds: addDays(lastPeriod, periodLength),
  };
}

export const BREASTFEEDING_QUESTIONS = [
  "How often should I breastfeed my newborn?",
  "My breast is painful when I feed. What should I do?",
  "How do I know my baby is getting enough milk?",
  "When can I start giving my baby water or food?",
  "How do I store breast milk safely at home?",
  "Can I breastfeed while I am taking medicine?",
];
