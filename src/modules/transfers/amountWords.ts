/** Convertit un montant entier en lettres (FR) — francs comoriens. */
const UNITS = [
  "", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];
const TENS = [
  "", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt",
];

function underHundred(n: number): string {
  if (n < 20) return UNITS[n] ?? "";
  if (n < 70) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (u === 1 && t !== 8) return `${TENS[t]}-et-un`;
    return u ? `${TENS[t]}-${UNITS[u]}` : TENS[t]!;
  }
  if (n < 80) {
    // 70-79 = soixante + 10-19
    const rest = n - 60;
    return rest === 11 ? "soixante-et-onze" : `soixante-${UNITS[rest]}`;
  }
  // 80-99
  const rest = n - 80;
  if (rest === 0) return "quatre-vingts";
  return `quatre-vingt-${UNITS[rest]}`;
}

function underThousand(n: number): string {
  if (n < 100) return underHundred(n);
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const head = h === 1 ? "cent" : `${UNITS[h]} cent${rest === 0 && h > 1 ? "s" : ""}`;
  return rest ? `${head} ${underHundred(rest)}` : head;
}

function underMillion(n: number): string {
  if (n < 1000) return underThousand(n);
  const th = Math.floor(n / 1000);
  const rest = n % 1000;
  const head = th === 1 ? "mille" : `${underThousand(th)} mille`;
  return rest ? `${head} ${underThousand(rest)}` : head;
}

export function amountInWordsFr(amount: number, currencyLabel = "francs comoriens"): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return `zéro ${currencyLabel}`;

  let words: string;
  if (n < 1_000_000) {
    words = underMillion(n);
  } else {
    const millions = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    const head =
      millions === 1 ? "un million" : `${underMillion(millions)} millions`;
    words = rest ? `${head} ${underMillion(rest)}` : head;
  }

  return `${words} ${currencyLabel}`;
}

export function buildTransferCsv(
  lines: Array<{
    order_number: number;
    beneficiary_name: string;
    job_title: string | null;
    bank_account: string | null;
    bank_rib: string | null;
    bank_name: string | null;
    amount: number;
  }>,
  currency = "KMF",
): string {
  const header = ["N", "Nom", "Fonction", "Banque", "Compte", "RIB", "Montant", "Devise"].join(";");
  const rows = lines.map((l) =>
    [
      String(l.order_number).padStart(3, "0"),
      l.beneficiary_name,
      l.job_title ?? "",
      l.bank_name ?? "",
      l.bank_account ?? "",
      l.bank_rib ?? "",
      String(Math.round(l.amount)),
      currency,
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(";"),
  );
  return [header, ...rows].join("\n");
}
