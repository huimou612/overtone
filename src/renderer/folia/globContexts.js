// Webpack discovery for folia's five Vite `import.meta.glob` sites.
//
// `require.context` is only expanded when webpack can read the arguments as
// literals at parse time, and it has to live in a CommonJS module — inside a
// ts-loader ESM module `require` is not even defined. So the five globs folia
// declares are spelled out here once, with Vite's relative key shape preserved
// (`./<dir>/<file>`), and viteGlob.ts wraps them into `{ default }` modules.

module.exports = {
  // components/visualizer/<mode>/entry.tsx
  visualizerEntries: require.context('./components/visualizer', true, /^\.\/[\w-]+\/entry\.tsx$/),
  // components/visualizer/backgrounds/<mode>/entry.tsx
  backgroundEntries: require.context('./components/visualizer/backgrounds', true, /^\.\/[\w-]+\/entry\.tsx$/),
  // components/visualizer/<mode>/tuning.ts
  tunings: require.context('./components/visualizer', true, /^\.\/[\w-]+\/tuning\.ts$/),
  // components/visualizer/backgrounds/<mode>/tuning.ts + settings.ts
  backgroundTunings: require.context('./components/visualizer/backgrounds', true, /^\.\/[\w-]+\/tuning\.ts$/),
  backgroundSettings: require.context('./components/visualizer/backgrounds', true, /^\.\/[\w-]+\/settings\.ts$/),
  // cappella picture packs
  avatars: require.context('./components/visualizer/cappella/avatar', true, /^\.\/.+\.(png|jpe?g|gif|webp|svg)$/),
  emos: require.context('./components/visualizer/cappella/emo', true, /^\.\/.+\.(png|jpe?g|gif|webp|svg)$/),
}
