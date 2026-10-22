import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@/theme/tokens";
import { formatDate, monthLabel, toIsoDate } from "./format";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

type Props = {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  minDate?: string;
};

/** Date input that opens a small month calendar (no native dependency). */
export function DateField({ label, value, onChange, minDate }: Props) {
  const [open, setOpen] = useState(false);
  const initial = value ? new Date(`${value}T12:00:00`) : new Date();
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (string | null)[] = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= daysInMonth; d++) out.push(toIsoDate(new Date(year, month, d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [year, month]);

  function shift(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.input} onPress={() => setOpen(true)}>
        <Text style={value ? styles.value : styles.placeholder}>
          {value ? formatDate(value) : "Choisir une date"}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <View style={styles.header}>
              <Pressable onPress={() => shift(-1)} hitSlop={12}>
                <Text style={styles.nav}>‹</Text>
              </Pressable>
              <Text style={styles.month}>{monthLabel(year, month)}</Text>
              <Pressable onPress={() => shift(1)} hitSlop={12}>
                <Text style={styles.nav}>›</Text>
              </Pressable>
            </View>
            <View style={styles.grid}>
              {WEEKDAYS.map((d, i) => (
                <Text key={`h${i}`} style={styles.weekday}>
                  {d}
                </Text>
              ))}
              {cells.map((iso, i) => {
                if (!iso) return <View key={`e${i}`} style={styles.cell} />;
                const disabled = !!minDate && iso < minDate;
                const selected = iso === value;
                const weekend = i % 7 >= 5;
                return (
                  <Pressable
                    key={iso}
                    disabled={disabled}
                    style={[styles.cell, selected && styles.cellSelected]}
                    onPress={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.day,
                        weekend && styles.dayWeekend,
                        disabled && styles.dayDisabled,
                        selected && styles.daySelected,
                      ]}
                    >
                      {Number(iso.slice(8, 10))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.reef,
    marginTop: 6,
  },
  input: {
    backgroundColor: colors.sand,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: colors.line,
  },
  value: { fontFamily: "Manrope_500Medium", fontSize: 16, color: colors.ink },
  placeholder: { fontFamily: "Manrope_500Medium", fontSize: 16, color: colors.muted },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10,54,61,0.45)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheet: { backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.md },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    paddingHorizontal: 6,
  },
  nav: { fontSize: 28, color: colors.lagoon, paddingHorizontal: 8 },
  month: { fontFamily: "Fraunces_600SemiBold", fontSize: 18, color: colors.lagoon },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: "center",
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    color: colors.muted,
    paddingVertical: 6,
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  cellSelected: { backgroundColor: colors.lagoon },
  day: { fontFamily: "Manrope_700Bold", fontSize: 15, color: colors.ink },
  dayWeekend: { color: colors.muted },
  dayDisabled: { color: "#C9CFCD" },
  daySelected: { color: colors.white },
});
