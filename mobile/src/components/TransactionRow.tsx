import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Transaction } from "@/lib/api";
import { formatNaira, formatTxnDate } from "@/lib/format";
import { colors, spacing } from "@/theme";

const statusColor = { successful: colors.muted, pending: colors.amber, failed: colors.red } as const;

function TransactionRowBase({ txn }: { txn: Transaction }) {
  const sign = txn.type === "credit" ? "+" : "-";
  const amountColor = txn.status === "failed" ? colors.muted : txn.type === "credit" ? colors.green : colors.text;
  const label = `${txn.description}, ${txn.type === "credit" ? "received" : "paid"} ${formatNaira(txn.amountKobo)}, ${txn.status}`;

  return (
    <View style={styles.row} accessible accessibilityLabel={label}>
      <View style={styles.left}>
        <Text style={styles.description} numberOfLines={1}>
          {txn.description}
        </Text>
        <Text style={[styles.meta, { color: statusColor[txn.status] }]}>
          {formatTxnDate(txn.createdAt)}
          {txn.status !== "successful" ? ` · ${txn.status[0]!.toUpperCase()}${txn.status.slice(1)}` : ""}
        </Text>
      </View>
      <Text style={[styles.amount, { color: amountColor }, txn.status === "failed" && styles.struck]}>
        {sign}
        {formatNaira(txn.amountKobo)}
      </Text>
    </View>
  );
}

export const TransactionRow = memo(TransactionRowBase);

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.lg, backgroundColor: colors.card },
  left: { flex: 1, marginRight: spacing.md },
  description: { fontSize: 15, color: colors.text, fontWeight: "500" },
  meta: { fontSize: 13, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
  struck: { textDecorationLine: "line-through" },
});
