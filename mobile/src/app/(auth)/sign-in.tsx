import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/theme";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setNotice(null);
    if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");

    setBusy(true);
    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setError(error.message === "Invalid login credentials" ? "Email or password is incorrect." : error.message);
        // On success the session listener switches to the app screens.
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) setError(error.message);
        else if (!data.session) setNotice("Check your email to confirm your account, then sign in.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
        <Text style={styles.brand}>Naira Assist</Text>
        <Text style={styles.subtitle}>{mode === "sign-in" ? "Sign in to your wallet" : "Create your account"}</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          editable={!busy}
          accessibilityLabel="Email"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          textContentType={mode === "sign-in" ? "password" : "newPassword"}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
          editable={!busy}
          accessibilityLabel="Password"
        />

        {error && (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        {notice && <Text style={styles.notice}>{notice}</Text>}

        <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={submit} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{mode === "sign-in" ? "Sign in" : "Create account"}</Text>}
        </Pressable>

        <Pressable onPress={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")} disabled={busy} style={styles.switch}>
          <Text style={styles.switchText}>{mode === "sign-in" ? "New here? Create an account" : "Have an account? Sign in"}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, justifyContent: "center", padding: spacing.xl },
  brand: { fontSize: 30, fontWeight: "700", color: colors.navy },
  subtitle: { fontSize: 16, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.xl },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: spacing.md,
    color: colors.text,
  },
  error: { color: colors.red, marginBottom: spacing.md },
  notice: { color: colors.green, marginBottom: spacing.md },
  button: { backgroundColor: colors.navy, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: spacing.sm },
  buttonBusy: { opacity: 0.7 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  switch: { marginTop: spacing.lg, alignItems: "center" },
  switchText: { color: colors.navySoft, fontWeight: "500" },
});
