/**
 * Stand-in for the `server-only` package under Vitest.
 *
 * `server-only`'s default entry throws unless the bundler resolves it under
 * the `react-server` export condition. Vitest runs plain node, so importing
 * any DAL module would fail before a single assertion ran. Aliased in
 * vitest.config.ts; nothing imports this directly.
 */
export {};
