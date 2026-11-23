import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ErrorState } from "@/components/ErrorState";
import { TransactionRow } from "@/components/TransactionRow";
import { useWallet } from "@/hooks/useWallet";
import { userMessage } from "@/lib/api";
import { colors, spacing } from "@/theme";

export default function WalletScreen() {
  const { data, error, isPending, isRefetching, refetch } = useWallet();

  if (isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.navy} accessibilityLabel="Loading wallet" />
      </View>
    );
  }

  if (error && !data) return <ErrorState message={userMessage(error)} onRetry={() => refetch()} />;

  return (
    <FlatList
      style={styles.list}
      data={data?.transactions ?? []}
      keyExtractor={(t) => t.id}
      renderItem={({ item }) => <TransactionRow txn={item} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.navy} />}
      ListHeaderComponent={
        <View>
          <View style={styles.balanceCard} accessible accessibilityLabel={`Wallet balance ${data?.balanceFormatted}`}>
            <Text style={styles.balanceLabel}>Available balance</Text>
            <Text style={styles.balance}>{data?.balanceFormatted}</Text>
          </View>
          {error && <Text style={styles.staleNote}>Showing saved data. {userMessage(error)}</Text>}
          <Text style={styles.section}>Recent transactions</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No transactions yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  list: { flex: 1, backgroundColor: colors.bg },
  balanceCard: { margin: spacing.lg, padding: spacing.xl, borderRadius: 20, backgroundColor: colors.navy },
  balanceLabel: { color: "#C9D3E0", fontSize: 14 },
  balance: { color: "#FFFFFF", fontSize: 32, fontWeight: "700", marginTop: spacing.xs, fontVariant: ["tabular-nums"] },
  staleNote: { color: colors.amber, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  section: { fontSize: 13, fontWeight: "600", color: colors.muted, textTransform: "uppercase", marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg },
  empty: { textAlign: "center", color: colors.muted, padding: spacing.xl },
});
