import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Alert,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { getPayslip } from "@/lib/api/mobile";
import { sharePayslipPdf } from "@/lib/payslip-pdf";
import type { MobilePayslipDetail, MobilePayslipLine } from "@/lib/api/types";
import { formatDate, formatMoney } from "@/ui/format";
import { colors, radii, spacing } from "@/theme/tokens";

export default function PayslipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [slip, setSlip] = useState<MobilePayslipDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!id) return;
    getPayslip(id)
      .then(setSlip)
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [id]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (!slip) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.lagoon} />
      </View>
    );
  }

  const cur = slip.currency_code;
  const earnings = slip.lines.filter((l) => l.kind === "earning");
  const deductions = slip.lines.filter((l) => l.kind === "deduction");
  const employer = slip.lines.filter((l) => l.kind === "employer_contribution");

  async function share() {
    if (!slip || sharing) return;
    setSharing(true);
    try {
      await sharePayslipPdf(slip.id, `${slip.employee_name}_${slip.period_label}`);
    } catch (e) {
      Alert.alert("Partage impossible", e instanceof Error ? e.message : "Réessayez dans un instant.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: slip.period_label }} />
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={styles.company}>{slip.company.trade_name || slip.company.legal_name}</Text>
          {slip.company.address_line1 || slip.company.city ? (
            <Text style={styles.headerMeta}>
              {[slip.company.address_line1, slip.company.city].filter(Boolean).join(", ")}
            </Text>
          ) : null}
          <Text style={styles.headerMeta}>
            Période du {formatDate(slip.period_start)} au {formatDate(slip.period_end)}
          </Text>
          <Text style={styles.headerMeta}>N° {slip.payslip_number ?? "—"}</Text>
        </View>

        <View style={styles.netCard}>
          <Text style={styles.netLabel}>Net à payer</Text>
          <Text style={styles.netValue}>{formatMoney(slip.net_amount, cur)}</Text>
          <Text style={styles.netMeta}>
            {slip.status === "paid" ? "Payé" : "Validé"}
            {slip.paid_at ? ` le ${formatDate(slip.paid_at)}` : ""}
          </Text>
        </View>

        <View style={styles.card}>
          <Row label="Salarié" value={slip.employee_name} />
          <Row label="Poste" value={slip.job_title ?? "—"} />
          <Row label="Service" value={slip.department_name ?? "—"} />
          <Row label="Salaire de base" value={formatMoney(slip.base_salary, cur)} />
          {slip.worked_hours != null ? (
            <Row
              label="Heures travaillées"
              value={`${Number(slip.worked_hours)} h${slip.expected_hours ? ` / ${Number(slip.expected_hours)} h` : ""}`}
            />
          ) : null}
          {Number(slip.overtime_hours) > 0 ? (
            <Row label="Heures supplémentaires" value={`${Number(slip.overtime_hours)} h`} />
          ) : null}
        </View>

        <Section title="Gains" lines={earnings} currency={cur} total={slip.gross_amount} totalLabel="Salaire brut" />
        <Section
          title="Retenues"
          lines={deductions}
          currency={cur}
          total={slip.deduction_amount}
          totalLabel="Total des retenues"
          negative
        />
        {employer.length > 0 ? (
          <Section
            title="Charges patronales (information)"
            lines={employer}
            currency={cur}
            total={slip.employer_contribution_amount}
            totalLabel="Total employeur"
          />
        ) : null}

        <Pressable style={[styles.btn, sharing && { opacity: 0.6 }]} disabled={sharing} onPress={() => void share()}>
          {sharing ? <ActivityIndicator color={colors.lagoonDark} /> : <Text style={styles.btnText}>Partager en PDF</Text>}
        </Pressable>
      </ScrollView>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Section({
  title,
  lines,
  currency,
  total,
  totalLabel,
  negative = false,
}: {
  title: string;
  lines: MobilePayslipLine[];
  currency: string;
  total: number;
  totalLabel: string;
  negative?: boolean;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {lines.length === 0 ? <Text style={styles.muted}>Aucune ligne</Text> : null}
      {lines.map((l) => (
        <View key={`${l.code}-${l.label}`} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabelStrong}>{l.label}</Text>
            {Number(l.rate_applied) > 0 ? (
              <Text style={styles.rowSub}>
                {Number(l.rate_applied)} % de {formatMoney(l.basis_amount, currency)}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.rowValue, negative && { color: colors.danger }]}>
            {negative ? "- " : ""}
            {formatMoney(l.amount, currency)}
          </Text>
        </View>
      ))}
      <View style={[styles.row, { borderBottomWidth: 0 }]}>
        <Text style={styles.totalLabel}>{totalLabel}</Text>
        <Text style={styles.totalValue}>{formatMoney(total, currency)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sand },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.sand, padding: spacing.lg },
  header: { gap: 2 },
  company: { fontFamily: "Fraunces_700Bold", fontSize: 22, color: colors.lagoon },
  headerMeta: { fontFamily: "Manrope_400Regular", color: colors.muted, fontSize: 13 },
  netCard: { backgroundColor: colors.lagoon, borderRadius: radii.xl, padding: spacing.lg },
  netLabel: { fontFamily: "IBMPlexMono_500Medium", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: colors.gold },
  netValue: { fontFamily: "Fraunces_700Bold", fontSize: 32, color: colors.white, marginTop: 4 },
  netMeta: { fontFamily: "Manrope_500Medium", color: colors.mist, marginTop: 4 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionTitle: { fontFamily: "Fraunces_600SemiBold", fontSize: 17, color: colors.lagoon, paddingTop: 8, paddingBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowLabel: { fontFamily: "Manrope_500Medium", color: colors.muted },
  rowLabelStrong: { fontFamily: "Manrope_500Medium", color: colors.ink },
  rowSub: { fontFamily: "Manrope_400Regular", color: colors.muted, fontSize: 12, marginTop: 2 },
  rowValue: { fontFamily: "IBMPlexMono_600SemiBold", color: colors.ink, textAlign: "right" },
  totalLabel: { fontFamily: "Manrope_800ExtraBold", color: colors.lagoon },
  totalValue: { fontFamily: "IBMPlexMono_600SemiBold", color: colors.lagoon },
  muted: { fontFamily: "Manrope_500Medium", color: colors.muted, paddingVertical: 8 },
  btn: { backgroundColor: colors.gold, borderRadius: radii.sm, paddingVertical: 15, alignItems: "center" },
  btnText: { color: colors.lagoonDark, fontFamily: "Manrope_800ExtraBold", fontSize: 15 },
  error: { color: colors.danger, fontFamily: "Manrope_500Medium", textAlign: "center" },
});
