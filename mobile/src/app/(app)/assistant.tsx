import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useHeaderHeight } from "expo-router/react-navigation";
import { MessageBubble } from "@/components/MessageBubble";
import { useChatStore } from "@/stores/appChat";
import type { ChatMessage } from "@/stores/chat";
import { colors, spacing } from "@/theme";

const SUGGESTIONS = ["What's my balance?", "Why did my data purchase fail?", "How much is ₦100,000 in dollars?"];

export default function AssistantScreen() {
  const messages = useChatStore((s) => s.messages);
  const isReplying = useChatStore((s) => s.isReplying);
  const send = useChatStore((s) => s.send);
  const retry = useChatStore((s) => s.retry);
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const headerHeight = useHeaderHeight();

  const submit = useCallback(
    (text: string) => {
      if (!text.trim() || isReplying) return;
      setDraft("");
      void send(text);
    },
    [send, isReplying],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MessageBubble message={item} onRetry={retry} />}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ask about your money</Text>
            <Text style={styles.emptyText}>I can check your balance, explain transactions and quote exchange rates. I can't move money.</Text>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} style={styles.chip} onPress={() => submit(s)} accessibilityRole="button">
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        }
        ListFooterComponent={
          isReplying ? (
            <View style={styles.typing} accessibilityLabel="Assistant is typing">
              <ActivityIndicator size="small" color={colors.muted} />
              <Text style={styles.typingText}>Thinking…</Text>
            </View>
          ) : undefined
        }
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Message Naira Assist"
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={2000}
          accessibilityLabel="Message"
        />
        <Pressable
          style={[styles.send, (!draft.trim() || isReplying) && styles.sendDisabled]}
          onPress={() => submit(draft)}
          disabled={!draft.trim() || isReplying}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { padding: spacing.lg, flexGrow: 1 },
  empty: { flex: 1, justifyContent: "center" },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  emptyText: { color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 20 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14, marginBottom: spacing.sm, alignSelf: "flex-start" },
  chipText: { color: colors.navySoft },
  typing: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  typingText: { color: colors.muted },
  composer: { flexDirection: "row", alignItems: "flex-end", padding: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.card },
  input: { flex: 1, maxHeight: 120, fontSize: 16, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.text },
  send: { backgroundColor: colors.navy, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, marginLeft: spacing.sm },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: "#FFFFFF", fontWeight: "600" },
});
