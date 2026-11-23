import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ChatMessage } from "@/stores/chat";
import { colors, spacing } from "@/theme";

function MessageBubbleBase({ message, onRetry }: { message: ChatMessage; onRetry: (id: string) => void }) {
  const mine = message.role === "user";
  return (
    <View style={[styles.wrap, mine ? styles.right : styles.left]}>
      <View style={[styles.bubble, mine ? styles.user : styles.bot, message.status === "sending" && styles.sending]}>
        <Text style={[styles.text, mine && styles.userText]}>{message.text}</Text>
      </View>
      {message.status === "failed" && (
        <Pressable onPress={() => onRetry(message.id)} accessibilityRole="button" accessibilityLabel="Retry sending message" hitSlop={8}>
          <Text style={styles.error}>{message.error ?? "Not sent."} Tap to retry.</Text>
        </Pressable>
      )}
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleBase);

const styles = StyleSheet.create({
  wrap: { marginVertical: spacing.xs, maxWidth: "85%" },
  left: { alignSelf: "flex-start" },
  right: { alignSelf: "flex-end", alignItems: "flex-end" },
  bubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16 },
  user: { backgroundColor: colors.bubbleUser, borderBottomRightRadius: 4 },
  bot: { backgroundColor: colors.bubbleBot, borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  sending: { opacity: 0.6 },
  text: { fontSize: 15, lineHeight: 21, color: colors.text },
  userText: { color: "#FFFFFF" },
  error: { color: colors.red, fontSize: 12, marginTop: 4 },
});
