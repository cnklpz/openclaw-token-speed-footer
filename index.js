import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { registerFooterPlugin } from "./registration.js";

export default definePluginEntry({
  id: "token-speed-footer",
  name: "Token & Speed Footer",
  description: "Appends official OpenClaw usage to Telegram final replies.",
  register: registerFooterPlugin,
});
