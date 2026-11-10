// Webpack build shims for the folia subtree.
//
// The folia sources were written against Vite: they import image assets
// directly and read `import.meta.env` in a few dev-only guards. Overtone builds
// with webpack, where images are handled by asset modules (also fine) and
// `import.meta.env` does not exist at type level — these declarations keep the
// byte-copied code compiling without touching it.

declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.gif' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}

interface ImportMeta {
  readonly env: Record<string, string | boolean | undefined>;
}
