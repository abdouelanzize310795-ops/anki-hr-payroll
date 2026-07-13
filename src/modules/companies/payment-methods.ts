/** Shared support / SLA for subscription mobile money payments. */
export const SUBSCRIPTION_SUPPORT = {
  whatsappLocal: "3899872",
  whatsappUrl: "https://wa.me/2693899872",
  activationSlaHours: 24,
} as const;

export type SubscriptionPaymentMethod = "mvola" | "poketra";

export type PaymentMethodInfo = {
  id: SubscriptionPaymentMethod;
  methodLabel: string;
  accountName: string;
  accountNumber: string;
  accountNameLabel: string;
  accountNumberLabel: string;
  openAppHint: string;
  logoSrc?: string;
  logoAlt?: string;
};

/** AnkibaPay M'Vola Comores */
export const MVOLA_PAYMENT: PaymentMethodInfo = {
  id: "mvola",
  methodLabel: "M'Vola Comores",
  accountName: "Mohamed Irsoid abdou el-Anzize",
  accountNumber: "4359872",
  accountNameLabel: "Nom du compte M'Vola",
  accountNumberLabel: "Numéro compte M'Vola",
  openAppHint: "Ouvrez M'Vola et initiez un transfert.",
  logoSrc: "/payments/mvola.png",
  logoAlt: "M'Vola Comores",
};

/** AnkibaPay Poketra EXIM BANK */
export const POKETRA_PAYMENT: PaymentMethodInfo = {
  id: "poketra",
  methodLabel: "Poketra EXIM BANK",
  accountName: "Mohamed Irsoid abdou el-Anzize",
  accountNumber: "4359872",
  accountNameLabel: "Nom du compte Poketra",
  accountNumberLabel: "Numéro compte Poketra",
  openAppHint: "Ouvrez Poketra (EXIM BANK) et initiez un transfert.",
  logoSrc: "/payments/poketra-exim.png",
  logoAlt: "Poketra EXIM BANK",
};

export const PAYMENT_METHODS: PaymentMethodInfo[] = [MVOLA_PAYMENT, POKETRA_PAYMENT];

export function getPaymentMethod(
  method: string | null | undefined,
): PaymentMethodInfo {
  const normalized = (method ?? "").trim().toLowerCase();
  if (normalized === "poketra") return POKETRA_PAYMENT;
  return MVOLA_PAYMENT;
}

export function paymentMethodLabel(method: string | null | undefined): string {
  return getPaymentMethod(method).methodLabel;
}
