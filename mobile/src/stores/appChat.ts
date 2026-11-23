import { api } from "@/lib/client";
import { createChatStore } from "./chat";

export const useChatStore = createChatStore(api.sendChat);
