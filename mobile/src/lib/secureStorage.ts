import * as SecureStore from "expo-secure-store";

/**
 * Supabase session storage backed by the device keychain/keystore.
 * SecureStore values should stay under ~2 KB and a Supabase session can be larger,
 * so values are split into chunks with a count stored under the base key.
 */
const CHUNK_SIZE = 1800;

export const chunkedSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (count === null) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null; // partial write: treat as signed out
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    await this.removeItem(key);
    const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, "g")) ?? [""];
    for (let i = 0; i < chunks.length; i++) await SecureStore.setItemAsync(`${key}.${i}`, chunks[i]!);
    // Count written last, so a crash mid-write never leaves a readable half-session.
    await SecureStore.setItemAsync(`${key}.n`, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const count = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    await SecureStore.deleteItemAsync(`${key}.n`);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
};
