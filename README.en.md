<p align="center"><a href="https://github.com/huimou612/overtone"><img width="200" src="./doc/images/icon.png" alt="Overtone logo"></a></p>

<h1 align="center">Overtone</h1>

<p align="center">
  <a href="https://github.com/huimou612/overtone/releases"><img src="https://img.shields.io/github/release/huimou612/overtone" alt="Release version"></a>
  <a href="https://github.com/huimou612/overtone/blob/master/LICENSE"><img src="https://img.shields.io/github/license/huimou612/overtone" alt="License"></a>
  <a href="https://electronjs.org/releases/stable"><img src="https://img.shields.io/github/package-json/dependency-version/huimou612/overtone/dev/electron/master" alt="Electron version"></a>
</p>

<p align="center">A local music player built on the <b>LX Music</b> shell, powered by <b>Folia</b>'s AI capabilities</p>

<p align="center"><a href="./README.md">简体中文</a> | English</p>

---

## What this is

Overtone is a **derivative work**. It stitches the strengths of two projects together:

| Source | What it contributes |
| --- | --- |
| [LX Music](https://github.com/lyswhut/lx-music-desktop) (Apache-2.0) | The desktop shell: Electron + Vue 3, the player core, playlists, custom-source loading, the desktop-lyric window, data sync, an open API, the theme system |
| [Folia](https://github.com/chthollyphile/folia-major) (AGPL-3.0) | The AI layer: AI lyric segmentation (per-word boundaries), AI credential storage, source separation (HTDemucs) |

In other words: **the same muscle memory as LX Music, plus two things it never did — "understand the lyrics" and "take the track apart".**

> Why do these two licenses fit together? Because Apache-2.0 may be combined into AGPL-3.0
> (not the other way around). See [NOTICE](./NOTICE) for the details.

---

## Features

### Inherited from LX Music

- Player and list system: playlists, favourites, temporary lists, list sync
- Desktop lyric window (horizontal / vertical, per-word lyrics)
- Data-sync service client
- Open API (a local HTTP service for third-party use)
- Theme system, tray, global shortcuts
- Packaging for Windows / macOS / Linux

> ⚠️ **Online playback goes through the "custom source" mechanism only** — this repository
> contains no music-platform interface implementation whatsoever (not even a search
> endpoint; see "How online playback works" below). If you want to stream songs, import
> your own source.

### Original to Overtone

- **AI lyric segmentation** — an LLM cuts each lyric line into words to provide the boundaries for karaoke-style highlighting. Results are written back to the local database, so they survive a reinstall
- **AI credential management** — API keys are encrypted with Electron `safeStorage` (Windows DPAPI / macOS Keychain / Linux libsecret); the UI can only tell whether a key is configured, never read it
- **Source separation** — HTDemucs running in a local Python sidecar, splitting a song into vocals and accompaniment, each exported as its own file
- **Personalised shell** — a customisable splash animation, video wallpapers (blur / mask), dual appearance modes (classic / personal), and cover-derived accent colours

The first three are reachable from the **Workbench** (a first-level sidebar entry); the
play-detail page also has a permanent toolbar (segment · separate), so you no longer need
to right-click the lyrics. Segmentation and separation run entirely on your machine —
audio is never uploaded.

---

## New in v0.2: Poster Wall & Lattice Lyrics

This release brings Folia's "listen by looking at the cover" experience into the LX Music shell.
The habits stay the same — the listening screen is rebuilt.

> Inspired by [LX Music (落雪音乐)](https://github.com/lyswhut/lx-music-desktop) for the player core and shell,
> and [Folia](https://github.com/chthollyphile/folia-major) for the poster wall / full-screen lyrics / timeline.

### Poster wall

- Open it from the sidebar; the current list is laid out as a wall of posters
- **Hover**: the cover scales up, gets a white outline, and drifts slightly with the pointer (parallax)
- **Single click**: play that track
- **Double click**: play it and enter the Lattice lyric screen
- Drag the window by the top bar; move the pointer to the **top-right corner** to reveal minimize / maximize / close

### Lattice lyric screen

- Large centered lyrics with per-word fill, plus one context line above and below
- Background: blurred cover + slowly shifting color layer + drifting particles
- Right-hand panel with four tabs:

  | Tab | Contents |
  | --- | --- |
  | Cover | Artwork, title, artist, album |
  | Audio FX | Sound-effect window (convolution reverb / equalizer / pitch / 3D panning), volume, lyric kind, timeline offset |
  | Queue | Play queue as a simple title/artist list, current track highlighted, click to play |
  | Timeline | Lyrics in time order; click a line to jump there; "Full timeline" for the large view |

- **Bottom bar**: a small pill by default (prev / play / next + title); hover it to expand into the full bar (draggable progress, time, panel toggle, open player)
- When the panel is closed, a round button at the bottom-right reopens it
- **Timeline offset**: nudge with `◀` / `▶` in ±100 ms steps; click the value to reset

### Cheat sheet

| Action | Result |
| --- | --- |
| Sidebar → Poster wall | Enter the wall |
| Click a cover | Play the track |
| Double-click a cover | Play and enter Lattice |
| Pointer near the top-right corner | Reveal window buttons |
| Hover the bottom pill | Expand the full control bar |
| Click the four panel icons | Switch Cover / Audio FX / Queue / Timeline |
| Click a timeline line | Seek to that line |
| `P` | Toggle the right panel |
| `ESC` | Step back: timeline → panel → lyric screen |
| Panel `✕` | Collapse the panel only |

---

## How online playback works

Overtone **ships no music-platform interfaces** (this is a hard rule of the project, not a
setting). A freshly installed Overtone can:

- ✅ **Play local music** — drop a folder into the list; files are decoded and played locally
- ✅ **Play imported playlists / share links** — provided their `source` points to a source you have imported
- ❌ **Not search anything** — the search box returns nothing, and the charts and genre playlists are empty
- ⚠️ **Covers may point at a platform CDN** — if your existing local library already records an
  artwork URL written by an earlier crawl, the UI will load that image, which can produce an
  **image** request to a platform CDN. That is an address in your data, not an API call

To get online capability back you need to **bring your own "custom source"**:

1. Settings → Basic → **Custom source** → Import (pick a source file)
2. Select it in the dropdown; the UI reports whether the source is usable
3. **Judge the source's provenance yourself** — this project does not provide, host, or endorse any source

"Custom source" is an open mechanism inherited from LX Music: a source is just a script
declaring the capabilities it offers. Overtone runs it inside the sandbox in
`src/renderer-scripts/` and only accepts the **audio URL / lyrics / cover** it returns.
The correctness and availability of that URL are the source's responsibility, not ours.

> This boundary is deliberate. The AI lyric segmentation and source separation that Folia
> brings are technically far more interesting than wiring up one more platform endpoint -
> and the latter would drag the whole project into legal risk. See "Red lines" below.

---

## Development

### Stack

- Electron 42+
- Vue 3 + TypeScript
- Webpack multi-entry build (`main` / `renderer` / `renderer-lyric` / `renderer-scripts`)

### Requirements

- Node.js 18+
- Python 3.8+ (for building native modules)

### Install

```bash
npm install
```

> **Gotcha:** when installing `electron` from a mirror, the package's `scripts` field may be
> missing, so the Electron binary is never downloaded and `node_modules/electron/dist` is
> absent. Fix it with:
>
> ```bash
> cd node_modules/electron
> ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" node install.js
> cd ../..
> ```

### Run in dev mode

```bash
npm run dev
```

> **Gotcha (Windows):** if your terminal injects `ELECTRON_RUN_AS_NODE=1`, Electron starts in
> plain Node mode and throws `TypeError: Not running in an Electron environment!`.
> Strip the variable first:
>
> ```bash
> env -u ELECTRON_RUN_AS_NODE npm run dev
> ```

Dev mode compiles all four entries; **Electron is only launched once all four succeed**.
The script lives at `build-config/runner-dev.js`.

### Build

```bash
# Windows installer
npm run pack:win:setup

# other targets: see the scripts in package.json
```

---

## Where data lives

- Linux: `$XDG_CONFIG_HOME/overtone` or `~/.config/overtone`
- macOS: `~/Library/Application Support/overtone`
- Windows: `%APPDATA%/overtone`

The actual database and settings sit under `<userData>/OvertoneData/`:
`overtone.data.db` (SQLite) plus several `*.json` files (settings, lists, custom sources).

> On Windows, if a `portable` folder exists next to the executable, that folder is used instead.

---

## Repository layout

```
.
├── src/
│   ├── common/            # shared between main and renderer (constants, IPC contracts, utils)
│   │   ├── ipcNames.ts    # single source of truth for IPC, named `${module}_${event}`
│   │   ├── mainIpc.ts     # main-process IPC helper
│   │   └── rendererIpc.ts # renderer-process IPC helper
│   ├── main/              # Electron main process
│   │   ├── modules/       # feature modules (winMain / winLyric / sync / userApi / tray …)
│   │   └── worker/        # database and other heavy work
│   ├── renderer/          # main window (Vue 3, 906 components)
│   ├── renderer-lyric/    # desktop lyric window
│   └── renderer-scripts/  # sandbox runtime for custom sources
├── build-config/          # build scripts (dev runner, electron-builder config)
├── publish/               # release scripts and version info
├── licenses/              # licence texts bundled into the installer and AppImage
└── doc/                   # docs and screenshots
```

### Adding a capability: the standard three steps

IPC here is **contract-driven**, so a new feature takes three steps:

1. **Declare the contract** — add event names in `src/common/ipcNames.ts`:

   ```ts
   const modules = {
     // ...
     ai: {
       segment_lyric: '',
       get_ai_config: '',
     },
   }
   ```

2. **Implement it in main** — create a folder under `src/main/modules/` and register it:

   ```ts
   import { mainHandle } from '@common/mainIpc'
   import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'

   mainHandle(WIN_MAIN_RENDERER_EVENT_NAME.get_ai_config, async() => {
     return getStore(STORE_NAMES.AI).get('config')
   })
   ```

3. **Call it from the renderer**:

   ```ts
   import { rendererInvoke } from '@common/rendererIpc'
   const result = await rendererInvoke(WIN_MAIN_RENDERER_EVENT_NAME.segment_lyric, payload)
   ```

---

## Contributing

PRs are welcome. One rule: **never submit any music-platform interface implementation,
encryption algorithm, or reverse-engineered code**. Such PRs are closed on sight (see below).

---

## License

Released under the [GNU Affero General Public License v3.0](./LICENSE).

Additional terms supplement AGPL v3.0 and prevail where they conflict. **The full and
legally binding text is the Chinese version in [README.md](./README.md); the summary below
is provided for convenience only.**

- **Data source.** This project's **code contains no music-platform interface, and calls none** —
  it does not search, resolve audio URLs, or fetch lyrics or charts. Online data comes from a
  custom source that the user imports, and we make no claim about its legality or accuracy. The
  project has no ability to fetch a specific audio stream: it passes the desired title and artist
  to the source and uses whatever URL comes back.

  *The one possible exception is **imagery**: if a user's existing local library already records
  an artwork URL pointing at a platform CDN (written by an earlier crawl), the UI will load that
  image, which can produce an image request to that CDN. That is an address carried in the user's
  own data — not an API call, and not contingent on this project shipping any source.*
- **Copyrighted data.** Using this project may produce copyrighted data. We do not own it.
  To avoid infringement, delete any such data within **24 hours**.
- **Platform aliases.** Platform aliases retained in the UI (used to label the origin of
  historical entries) are merely names and carry no malice. Platforms may ask us to change
  or remove them.
- **Disclaimer.** Any damages arising from the use of, or inability to use, this project are
  the user's responsibility.
- **Non-commercial.** This project exists to explore technical feasibility. It accepts no
  commercial partnerships (advertising included) and no donations.
- **AGPL § 13.** If you offer a modified version of this project as a network service, you
  must provide the complete corresponding source code to all users interacting with it over
  the network.
- **Attribution.** You must keep the copyright and provenance notices, and must not remove
  or alter the credit to LX Music, Folia, and the upstream contributors.
- **Acceptance.** Using this project means you accept these terms.

---

## Red lines

The following **never** enter this repository:

1. Any reverse-engineered interface implementation, encryption algorithm, signing logic, or
   private-protocol code for any music platform.
2. Any copyrighted material — audio files, lyric data, album art.
3. Any technique that circumvents a platform's copyright protection or paywall.

Online playback is exposed only through the "custom source" mechanism, and the source is
provided by the user.

---

## Credits

- [LX Music](https://github.com/lyswhut/lx-music-desktop) — lyswhut and all contributors
- [Folia](https://github.com/chthollyphile/folia-major) — chthollyphile and all contributors

Without these two projects there would be no Overtone.
