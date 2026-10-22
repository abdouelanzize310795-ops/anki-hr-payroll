import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getCompensation, listDocuments, listPayslips } from "@/lib/api/mobile";
import type { MobileCompensation, MobileDocument, MobilePayslip } from "@/lib/api/types";
import { getApiUrl } from "@/lib/supabase";
import { formatDate, formatMoney } from "@/ui/format";
import { colors, radii, spacing } from "@/theme/tokens";

const CONTRACT_LABEL: Record<string, string> = {
  cdi: "CDI",
  cdd: "CDD",
  essai: "Période d’essai",
  stage: "Stage",
  consultant: "Consultant",
};

const DOC_CATEGORY: Record<string, string> = {
  contract: "Contrat",
  payslip: "Bulletin",
  identity: "Identité",
  policy: "Règlement",
  medical: "Médical",
  other: "Document",
};

export default function PayScreen() {
  const [comp, setComp] = useState<MobileCompensation | null>(null);
  const [payslips, setPayslips] = useState<MobilePayslip[]>([]);
  const [docs, setDocs] = useState<MobileDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, p, d] = await Promise.all([getCompensation(), listPayslips(24), listDocuments()]);
      setComp(c);
      setPayslips(p);
      setDocs(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  async function openDocument(doc: MobileDocument) {
    if (!doc.url) {
      Alert.alert("Indisponible", "Ce fichier n’est pas disponible pour le moment.");
      return;
    }
    const base = await getApiUrl();
    await Linking.openURL(`${base}${doc.url}`).catch(() =>
      Alert.alert("Erreur", "Impossible d’ouvrir le fichier."),
    );
  }

  if (loading && !comp) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.lagoon} />
      </View>
    );
  }

  const currency = comp?.currency_code ?? "KMF";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.lagoon} />}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {comp ? (
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Salaire de base mensuel</Text>
          <Text style={styles.heroValue}>{formatMoney(comp.base_salary, currency)}</Text>
          <View style={styles.heroRow}>
            <View>
              <Text style={styles.heroSmallLabel}>Net perçu en {new Date().getFullYear()}</Text>
              <Text style={styles.heroSmall}>{formatMoney(comp.year_to_date.net, currency)}</Text>
            </View>
            <View>
              <Text style={styles.heroSmallLabel}>Brut cumulé</Text>
              <Text style={styles.heroSmall}>{formatMoney(comp.year_to_date.gross, currency)}</Text>
            </View>
          </View>
        </View>
      ) : null}

      {comp ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Mon contrat</Text>
          <Info label="Poste" value={comp.job_title} />
          <Info label="Matricule" value={comp.employee_number} />
          <Info label="Date d’embauche" value={formatDate(comp.hire_date)} />
          {comp.contract ? (
            <>
              <Info
                label="Type de contrat"
                value={CONTRACT_LABEL[comp.contract.contract_type] ?? comp.contract.contract_type}
              />
              <Info label="Début" value={formatDate(comp.contract.start_date)} />
              {comp.contract.end_date ? <Info label="Fin" value={formatDate(comp.contract.end_date)} /> : null}
              <Info
                label="Temps de travail"
                value={`${Number(comp.contract.hours_per_week)} h / semaine · ${Number(comp.contract.work_days_per_week)} j`}
              />
              {comp.contract.benefits ? <Info label="Avantages" value={comp.contract.benefits} /> : null}
            </>
          ) : (
            <Text style={styles.muted}>Aucun contrat électronique enregistré.</Text>
          )}
        </View>
      ) : null}

      {comp ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Versement du salaire</Text>
          <Info label="Banque" value={comp.bank_name} />
          <Info label="N° de compte" value={comp.bank_account} />
          <Info label="RIB" value={comp.bank_rib} />
          <Text style={styles.hint}>Pour modifier ces informations, contactez les RH.</Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Mes bulletins de paie</Text>
      {payslips.length === 0 ? (
        <Text style={styles.muted}>Aucun bulletin disponible pour le moment.</Text>
      ) : (
        payslips.map((p) => (
          <Pressable
            key={p.id}
            style={styles.row}
            onPress={() => router.push({ pathname: "/payslip/[id]", params: { id: p.id } })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{p.period_label}</Text>
              <Text style={styles.rowMeta}>
                {p.payslip_number ?? "Bulletin"} · brut {formatMoney(p.gross_amount, p.currency_code)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.net}>{formatMoney(p.net_amount, p.currency_code)}</Text>
              <Text style={styles.rowLink}>Voir ›</Text>
            </View>
          </Pressable>
        ))
      )}

      <Text style={styles.sectionLabel}>Mes documents</Text>
      {docs.length === 0 ? (
        <Text style={styles.muted}>Aucun document partagé par les RH.</Text>
      ) : (
        docs.map((d) => (
          <Pressable key={d.id} style={styles.row} onPress={() => openDocument(d)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{d.title}</Text>
              <Text style={styles.rowMeta}>
                {DOC_CATEGORY[d.category] ?? "Document"} · {formatDate(d.created_at)}
              </Text>
            </View>
            <Text style={styles.rowLink}>Ouvrir ›</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sand },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.sand },
  hero: { backgroundColor: colors.lagoon, borderRadius: radii.xl, padding: spacing.lg },
  heroLabel: { fontFamily: "IBMPlexMono_500Medium", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: colors.gold },
  heroValue: { fontFamily: "Fraunces_700Bold", fontSize: 32, color: colors.white, marginTop: 6 },
  heroRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, gap: 12 },
  heroSmallLabel: { fontFamily: "Manrope_400Regular", fontSize: 12, color: colors.mist },
  heroSmall: { fontFamily: "Manrope_700Bold", fontSize: 15, color: colors.white, marginTop: 2 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTitle: { fontFamily: "Fraunces_600SemiBold", fontSize: 18, color: colors.lagoon, marginBottom: 6 },
  info: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  infoLabel: { fontFamily: "Manrope_500Medium", color: colors.muted },
  infoValue: { fontFamily: "Manrope_700Bold", color: colors.ink, flexShrink: 1, textAlign: "right" },
  hint: { fontFamily: "Manrope_400Regular", fontSize: 12, color: colors.muted, marginTop: 8 },
  sectionLabel: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.reef,
    marginTop: 4,
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowTitle: { fontFamily: "Manrope_700Bold", color: colors.ink },
  rowMeta: { fontFamily: "Manrope_400Regular", color: colors.muted, marginTop: 2, fontSize: 12 },
  rowLink: { fontFamily: "Manrope_700Bold", color: colors.reef, fontSize: 13, marginTop: 2 },
  net: { fontFamily: "IBMPlexMono_600SemiBold", color: colors.lagoon },
  muted: { fontFamily: "Manrope_500Medium", color: colors.muted },
  error: { color: colors.danger, fontFamily: "Manrope_500Medium" },
});
