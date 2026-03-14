/**
 * Reference ESLint flat config for Node.js backend services.
 *
 * NOTE: This file is NOT imported by the individual services because Node.js
 * resolves package imports relative to the file's own location. Each service
 * has its own self-contained eslint.config.js that mirrors this config and
 * resolves all imports from that service's node_modules.
 *
 * Stack: TypeScript + Node.js (ESM, no browser globals).
 * Prettier integration: eslint-config-prettier is last, disabling all
 * formatting rules so ESLint and Prettier never conflict.
 */

