const path = require('path');
const fs = require('fs');

// src/main/modules/analysis/modelPaths.cjs
// Where a model file is, given the places it is allowed to be.
//
// Ported from Folia's electron/analysis/modelPaths.cjs (AGPL-3.0). Kept line-for-line where we did
// not need to change it, so a future diff against upstream stays readable. The one deliberate
// difference: upstream knows two models (beat_this for beat grids, htdemucs for stems) and we only
// ship htdemucs, because the beat-grid model serves the automix feature we do not have.
//
// Resolved per FILE rather than per directory, which matters here too: the weights (109MB) and the
// interpreter that runs them (36MB) are two separate downloads, so "weights present, runtime
// missing" is an ordinary state, not a corner case - and it is exactly the state in which a
// separation must refuse rather than crash.

/** Every model this app knows how to run. */
const MODEL_NAMES = ['htdemucs'];

/**
 * The first of `dirs` that actually holds this model, or null.
 *
 * Order is the caller's: the user's own directory first, then what the app downloaded.
 */
const resolveModelFile = (dirs, name) => {
    for (const dir of dirs) {
        if (!dir) continue;
        const file = path.join(dir, `${name}.onnx`);
        // isFile rather than existsSync: a DIRECTORY of that name passes existsSync, and the result is the
        // settings page reporting the model installed while onnxruntime gets handed a folder.
        if (fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return file;
    }
    return null;
};

// The Python runtime htdemucs separation needs - a second download that lands as a `runtime/`
// folder beside the model files, in the same directories, best first.
const RUNTIME_NAME = 'runtime';
/** Where the interpreter sits inside the runtime directory. Set by build/buildPythonRuntime.mjs. */
const RUNTIME_BIN = process.platform === 'win32' ? ['python.exe'] : ['bin', 'python3'];

/**
 * The installed runtime DIRECTORY, or null. Probed by the interpreter inside it, never by the
 * folder existing: a half-extracted archive leaves the folder there, and a runtime directory with
 * no interpreter in it would otherwise read as installed.
 */
const resolveRuntimeDir = (dirs) => {
    for (const dir of dirs) {
        if (!dir) continue;
        const home = path.join(dir, RUNTIME_NAME);
        if (fs.statSync(path.join(home, ...RUNTIME_BIN), { throwIfNoEntry: false })?.isFile()) return home;
    }
    return null;
};

/** The runtime interpreter's path if a usable runtime is installed in one of `dirs`, else null. */
const resolveRuntime = (dirs) => {
    const home = resolveRuntimeDir(dirs);
    return home && path.join(home, ...RUNTIME_BIN);
};

const runtimePresent = (dirs) => resolveRuntime(dirs) !== null;

/**
 * `{ htdemucs: false }` for the settings page. A few stats, nothing loaded.
 *
 * This answers "can the feature RUN", not "is the file there", and for htdemucs those are
 * different questions: the weights are useless without the interpreter that runs them, and that is
 * a separate download. Reporting the .onnx alone is how a machine with the model and no runtime
 * gets a dialog promising separation while every run silently declines.
 */
const modelsPresent = (dirs) => Object.fromEntries(MODEL_NAMES.map(name => [
    name,
    resolveModelFile(dirs, name) !== null && (name !== 'htdemucs' || runtimePresent(dirs)),
]));

/** What a per-platform manifest entry is keyed by. Matches Electron's own two strings. */
const PLATFORM = `${process.platform}-${process.arch}`;

/**
 * The manifest's downloadables as they apply to THIS machine, with the platform variant folded in.
 *
 * The weights are one file for everyone; the runtime is a different archive per platform and does
 * not exist for all of them. Rather than teach every caller that difference, a per-platform entry
 * comes back looking exactly like a plain one - same `file`, `bytes`, `sha256` - plus `supported`.
 *
 * Unsupported platforms are RETURNED, not filtered out, which is the whole point of the flag: the
 * dialog has to draw a row saying this machine cannot run separation. Dropping the entry would
 * leave it silently absent, and "the feature isn't offered" and "the feature isn't listed" look
 * identical to someone who came looking for it. (The upstream note about `enables` still holds:
 * a download is offered only when the thing it switches on can actually run here.)
 */
const downloadables = (manifest, platform = PLATFORM) => {
    const resolved = manifest.models.map((entry) => {
        if (!entry.platforms) return { ...entry, supported: true };
        const { platforms, ...rest } = entry;
        const variant = platforms[platform];
        return variant ? { ...rest, ...variant, supported: true } : { ...rest, supported: false };
    });

    const blocked = new Set(resolved.filter(entry => !entry.supported).map(entry => entry.enables));
    return resolved.map(entry => (blocked.has(entry.enables) ? { ...entry, supported: false } : entry));
};

module.exports = {
    MODEL_NAMES, RUNTIME_NAME, RUNTIME_BIN, PLATFORM,
    resolveModelFile, modelsPresent, resolveRuntime, resolveRuntimeDir, runtimePresent, downloadables,
};
