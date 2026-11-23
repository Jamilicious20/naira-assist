import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/theme";

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
      <Pressable style={styles.button} onPress={onRetry} accessibilityRole="button">
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { padding: spacing.xl, alignItems: "center" },
  text: { color: colors.muted, fontSize: 15, textAlign: "center", marginBottom: spacing.md },
  button: { backgroundColor: colors.navy, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  buttonText: { color: "#FFFFFF", fontWeight: "600" },
});
