/**
 * Editor feature public API.
 * Only export what other features or the app shell need to consume.
 * Internal implementation details stay private within this folder.
 */
export { GhostText, ghostTextPluginKey } from "./extensions/GhostText";
export { useGhostText } from "./hooks/useGhostText";
