/**
 * Editor feature public API.
 * Only export what other features or the app shell need to consume.
 * Internal implementation details stay private within this folder.
 */
export { GhostText, ghost_text_plugin_key } from "./extensions/ghost_text";
export { useGhostText } from "./hooks/use_ghost_text";
