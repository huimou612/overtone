// Webpack replacement for Vite's `import.meta.glob(..., { eager: true })`.
//
// folia discovers its mode / tuning / background / picture-pack modules with a
// Vite glob. Overtone builds with webpack, so the same five globs are declared
// as literal `require.context` calls in ./globContexts.js (webpack can only
// expand literal arguments, and only from a CommonJS module), and this wrapper
// re-shapes them into what the call sites expect: Vite's relative keys
// (`./xxx/yyy`) and the `{ default }` module wrapper — so the rest of the
// byte-copied code stays untouched.

import rawContexts from './globContexts';

interface RequireContext {
    keys(): string[];
    (id: string): unknown;
}

const contexts = rawContexts as unknown as Record<string, RequireContext>;

export type GlobKey =
    | 'visualizerEntries'
    | 'backgroundEntries'
    | 'tunings'
    | 'backgroundTunings'
    | 'backgroundSettings'
    | 'avatars'
    | 'emos';

export function importGlobEager<T = unknown>(key: GlobKey): Record<string, T> {
    const ctx = contexts[key];
    if (!ctx) throw new Error(`importGlobEager: unknown glob "${key}"`);
    // Vite's eager glob yields the module namespace for ts/tsx entries
    // (`{ default: … }`) and the asset URL string for images — exactly what
    // webpack's require.context yields, so values pass through untouched.
    const out: Record<string, T> = {};
    for (const path of ctx.keys()) {
        out[path] = ctx(path) as T;
    }
    return out;
}
