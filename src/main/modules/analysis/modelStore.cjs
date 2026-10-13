const { createHash } = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { unzipSync } = require('fflate');
const {
    MODEL_NAMES, RUNTIME_BIN, resolveModelFile, resolveRuntimeDir, downloadables,
} = require('./modelPaths.cjs');

// src/main/modules/analysis/modelStore.cjs
// Getting the weights onto the listener's disk: over the network, or off a file they already have.
//
// Ported from Folia's electron/analysis/modelStore.cjs (AGPL-3.0) with three changes:
//   1. the manifest is the local one (only htdemucs + runtime), not upstream's shared/ copy;
//   2. logging goes through an injected logger instead of console, so it lands in the app log;
//   3. that is all. Every safety property below is upstream's and is kept deliberately.
//
// Both routes end at the same place and pass the same test. A file that arrives by netdisk is verified
// exactly like one we downloaded, because the risk is identical and it is not the kind of risk a human
// carrying the file reduces: a truncated or substituted ONNX does not fail loudly, it loads and answers
// confidently and wrongly. There is no second, laxer trust level here.

const manifest = require('./modelManifest.json');

/** Progress is reported at most this often. A 109MB download is thousands of chunks. */
const PROGRESS_INTERVAL_MS = 200;
/** How long a mirror gets to START answering, as opposed to to finish. A cold mirror is slow, not dead. */
const RESPOND_TIMEOUT_MS = 45_000;

const hashFile = (file) => new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    fs.createReadStream(file)
        .on('data', chunk => hash.update(chunk))
        .on('error', reject)
        .on('end', () => resolve(hash.digest('hex')));
});

/** Whether this exact file is the model it claims to be. Size first: it rejects almost everything. */
const fileIsModel = async (file, model) => {
    const stat = await fsp.stat(file).catch(() => null);
    if (!stat?.isFile() || stat.size !== model.bytes) return false;
    return await hashFile(file).catch(() => null) === model.sha256;
};

/** Bytes on disk at `target`, which since the runtime arrived may be a directory of ~1400 files. */
const sizeOf = async (target) => {
    const stat = await fsp.stat(target);
    if (!stat.isDirectory()) return stat.size;
    let total = 0;
    for (const entry of await fsp.readdir(target, { withFileTypes: true })) {
        total += await sizeOf(path.join(target, entry.name));
    }
    return total;
};

/**
 * Unpacks a verified archive into `home`, replacing whatever was there. The archive is left
 * alone - whether it should survive depends on whose it is, and only the caller knows that.
 *
 * Staged under `.part` and renamed for the same reason the downloads are: extracting ~1400 files
 * straight into `runtime/` means a run interrupted half way leaves a directory that LOOKS
 * installed. The rename is the only moment the real name exists, and it is atomic.
 *
 * The chmod is not optional off Windows. A zip stores unix permission bits by convention and
 * fflate does not restore them, so every extracted file arrives 0644 - including the interpreter,
 * which then cannot be executed at all. One file needs it: the build drops everything else in bin/.
 */
const unpack = async (archive, home) => {
    const staging = `${home}.part`;
    await fsp.rm(staging, { recursive: true, force: true });
    for (const [name, body] of Object.entries(unzipSync(await fsp.readFile(archive)))) {
        if (name.endsWith('/')) continue;
        const out = path.join(staging, name);
        // Defence in depth: both callers unpack only after a sha256 check, but a zip entry named
        // `../x` would still `path.join` its way out of staging.
        if (!path.resolve(out).startsWith(path.resolve(staging) + path.sep)) {
            throw new Error(`refusing zip entry outside staging: ${name}`);
        }
        await fsp.mkdir(path.dirname(out), { recursive: true });
        await fsp.writeFile(out, body);
    }
    if (process.platform !== 'win32') await fsp.chmod(path.join(staging, ...RUNTIME_BIN), 0o755);

    await fsp.rm(home, { recursive: true, force: true });
    await fsp.rename(staging, home);
};

/**
 * @param getModelsDirs  places a model may already be, best first
 * @param getDownloadDir where a download lands
 * @param onProgress     `{ name, status, received, total, host }`
 * @param onChanged      called when the installed set changed
 * @param logger         optional `{ warn, info }`; defaults to console so this file stays runnable standalone
 */
const createModelStore = ({ getModelsDirs, getDownloadDir, onProgress, onChanged, logger }) => {
    const log = logger ?? { warn: console.warn, info: console.log };
    const dirs = () => (getModelsDirs?.() ?? []).filter(Boolean);

    /**
     * The manifest as it applies to this machine - see `downloadables`.
     *
     * Read when the store is BUILT rather than when this module is imported, so a test that rewrites
     * the manifest to describe stand-in weights does not get the real hashes anyway.
     */
    const ENTRIES = downloadables(manifest);

    /** Only ever something this machine can install, so no caller has to check `supported`. */
    const modelBy = (name) => ENTRIES.find(entry => entry.name === name && entry.supported) ?? null;

    /** Where this entry is installed, or null. A model is a file; the runtime is a directory. */
    const installedPath = (entry) => (entry.unpack
        ? resolveRuntimeDir(dirs())
        : resolveModelFile(dirs(), entry.name));

    /** name -> AbortController, so a download in flight can be called off. */
    const running = new Map();

    const report = (event) => {
        try { onProgress?.(event); } catch { /* a closed window is not news */ }
    };

    /**
     * sha256 state for what is already in a `.part` file, so a resumed transfer hashes as one stream.
     *
     * Returning a live hash rather than a digest is the whole point: the point of the resume is that
     * the bytes before and after the break form ONE file, and the only way to prove that is to hash
     * them as one. Read before the append handle opens, so the reader is never chasing the writer.
     */
    const hashOfPrefix = async (file) => {
        const hash = createHash('sha256');
        if (!file) return hash;
        for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
        return hash;
    };

    /**
     * Streams one model in, hashing as it goes, and only then puts it where the runner looks.
     *
     * Written to a `.part` file and renamed, because the alternative is a half-file sitting under
     * the real name: resolveModelFile would find it, the dialog would call the model installed, and
     * onnxruntime would be handed a truncated graph.
     *
     * RESUMES, which is a deliberate addition to the upstream version. Upstream streams once and
     * leans on having several mirrors; measured against the network this app actually ships into,
     * every mirror truncates a long transfer - hf-mirror, huggingface.co and github all cut at
     * roughly 10MB here - so "start the whole 109MB again on the next host" never converges. A Range
     * request picks up where the last attempt stopped. It is safe for the reason above: the .part is
     * verified by sha256 over its full length before it is ever renamed, so a resume that spliced
     * the wrong bytes in fails that check exactly like a corruption would.
     */
    const downloadTo = async (model, url, target, signal, attempts = 6) => {
        const host = new URL(url).host;
        const part = `${target}.part`;
        let lastFailure = `${host}: not attempted`;

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            if (signal?.aborted) return `${host}: canceled`;

            const have = (await fsp.stat(part).catch(() => null))?.size ?? 0;
            if (have > model.bytes) await fsp.rm(part, { force: true }).catch(() => { });

            const controller = new AbortController();
            const abort = () => controller.abort(new Error('canceled'));
            signal?.addEventListener('abort', abort, { once: true });
            // Covers the headers only. A mirror doing a cold pull of 109MB from its origin is slow,
            // not dead, and a budget spanning the transfer judged exactly that case wrong already.
            let deadline = setTimeout(() => controller.abort(new Error('no response')), RESPOND_TIMEOUT_MS);

            try {
                const offset = (await fsp.stat(part).catch(() => null))?.size ?? 0;
                const response = await fetch(url, {
                    redirect: 'follow',
                    signal: controller.signal,
                    headers: offset ? { Range: `bytes=${offset}-` } : {},
                });
                clearTimeout(deadline);
                deadline = null;
                if (!response.ok) {
                    lastFailure = `${host}: ${response.status} ${response.statusText}`;
                    // 404/403 will not change by asking again; anything else might.
                    if (response.status >= 400 && response.status < 500) return lastFailure;
                    continue;
                }

                // A server that ignores Range answers 200 with the whole object, so the offset has
                // to be dropped rather than trusted - appending it would duplicate the prefix.
                const resuming = response.status === 206 && offset > 0;
                const base = resuming ? offset : 0;
                if (!resuming && offset) await fsp.rm(part, { force: true }).catch(() => { });

                const hash = await hashOfPrefix(resuming ? part : null);
                const total = model.bytes;
                const handle = await fsp.open(part, resuming ? 'a' : 'w');
                let received = base;
                let announced = 0;
                try {
                    for await (const chunk of response.body) {
                        hash.update(chunk);
                        await handle.write(chunk);
                        received += chunk.length;
                        const now = Date.now();
                        if (now - announced >= PROGRESS_INTERVAL_MS) {
                            announced = now;
                            report({ name: model.name, status: 'downloading', received, total, host });
                        }
                    }
                } finally {
                    await handle.close();
                }

                const digest = hash.digest('hex');
                if (received === model.bytes && digest === model.sha256) {
                    await fsp.rename(part, target);
                    return null;
                }
                if (received > model.bytes) {
                    // More than the manifest says: whatever is on disk is not a prefix of the model,
                    // so there is nothing to resume from.
                    await fsp.rm(part, { force: true }).catch(() => { });
                    return `${host}: overran at ${received}, sha256 ${digest.slice(0, 12)}`
                        + ` (wanted ${model.bytes}, ${model.sha256.slice(0, 12)})`;
                }

                // Short but consistent with a prefix: the connection was cut, which is the ordinary
                // case here. Keep the bytes and try again from where we stopped.
                lastFailure = `${host}: truncated at ${received}/${model.bytes}`;
            } catch (error) {
                lastFailure = `${host}: ${error?.cause?.message || error?.message || String(error)}`;
                if (signal?.aborted) return `${host}: canceled`;
            } finally {
                if (deadline) clearTimeout(deadline);
                signal?.removeEventListener('abort', abort);
            }
        }

        return lastFailure;
    };

    /**
     * Fetches one model, trying every mirror in turn.
     *
     * Resolves with the reasons rather than throwing when they all fail: the caller is a dialog that
     * has to SHOW them, and every one of them is ordinary - a blocked host, a cold mirror, no
     * network - rather than exceptional.
     */
    const download = async (name) => {
        const model = modelBy(name);
        if (!model) return { ok: false, skipped: [`unknown model ${name}`] };
        if (running.has(name)) return { ok: false, skipped: ['already downloading'] };

        const dir = getDownloadDir();
        await fsp.mkdir(dir, { recursive: true });
        const target = path.join(dir, model.file);

        const controller = new AbortController();
        running.set(name, controller);
        report({ name, status: 'downloading', received: 0, total: model.bytes, host: null });

        const skipped = [];
        try {
            for (const template of manifest.mirrors) {
                if (controller.signal.aborted) {
                    skipped.push('canceled');
                    break;
                }
                const url = template.replace('{file}', model.file);
                const failure = await downloadTo(model, url, target, controller.signal);
                if (failure === null) {
                    // Unpacked only AFTER the hash matched, never straight out of the response:
                    // this writes ~1400 files into the models directory, and doing that from bytes
                    // nobody has checked is how a bad mirror would get to choose them.
                    const home = model.unpack && path.join(dir, model.unpack);
                    if (home) {
                        await unpack(target, home);
                        // Ours, downloaded seconds ago, a third the size of what it unpacked to,
                        // and never read again - what counts as installed is the interpreter in
                        // the directory. Deleted here rather than inside `unpack`, because the
                        // other caller's archive belongs to the listener. See installLocal.
                        await fsp.rm(target, { force: true });
                    }
                    report({ name, status: 'ready', received: model.bytes, total: model.bytes, host: null });
                    onChanged?.();
                    return { ok: true, skipped, path: home || target };
                }
                skipped.push(failure);
            }
        } finally {
            running.delete(name);
        }

        // Logged whether or not a later mirror worked - a silent fallback is the failure mode worth
        // designing against here.
        for (const failure of skipped) log.warn(`[analysis] model ${name}: skipped ${failure}`);
        report({ name, status: 'failed', received: 0, total: model.bytes, host: null });
        return { ok: false, skipped };
    };

    const cancel = (name) => {
        const controller = running.get(name);
        controller?.abort(new Error('canceled'));
        return controller !== undefined;
    };

    /**
     * Copies a verified local file into the models directory. Copy, never move.
     *
     * The listener downloaded it and may well want it again - for another machine, or after they
     * change the model directory. Taking their file away as a side effect of installing it is a
     * surprise, and disk is cheaper than that surprise.
     */
    const installLocal = async (name, source) => {
        const model = modelBy(name);
        if (!model) return { ok: false, reason: `unknown model ${name}` };
        if (!await fileIsModel(source, model)) {
            return { ok: false, reason: 'that file is not this model, or is damaged' };
        }

        const dir = getDownloadDir();
        await fsp.mkdir(dir, { recursive: true });
        const target = path.join(dir, model.file);

        // An archive is unpacked straight out of where the listener already has it. Copying it in
        // first would mean holding two copies of a 36MB zip to produce a directory that needs
        // neither, and `unpack` puts the result behind the same staged rename either way.
        if (model.unpack) {
            const home = path.join(dir, model.unpack);
            try {
                await unpack(source, home);
            } catch (error) {
                return { ok: false, reason: error?.message || String(error) };
            }
            onChanged?.();
            return { ok: true, path: home };
        }

        if (path.resolve(source) === path.resolve(target)) {
            onChanged?.();
            return { ok: true, path: target };
        }

        // Through a `.part` file and a rename, for the same reason the download is: a copy
        // interrupted half way must not be discoverable under the real name.
        const part = `${target}.part`;
        try {
            await fsp.copyFile(source, part);
            await fsp.rename(part, target);
        } catch (error) {
            await fsp.rm(part, { force: true }).catch(() => { });
            return { ok: false, reason: error?.message || String(error) };
        }
        onChanged?.();
        return { ok: true, path: target };
    };

    /**
     * Deletes every copy of every model this app can reach, and says what it could not.
     *
     * Deliberately deletes the RESOLVED path rather than only the download directory, so "delete all"
     * means the ones the page is currently reporting as installed. `.part` files go too: they are
     * ours, worth up to 109MB each, and nothing else will ever clean them up.
     */
    const removeAll = async () => {
        const searched = dirs();
        const removed = [];
        const failed = [];
        let freed = 0;

        for (const model of ENTRIES) {
            const target = installedPath(model);
            if (target) {
                try {
                    // The runtime is ~1400 files, so this is a tree walk rather than a stat - and
                    // it is what makes the freed figure honest for the biggest item on the page.
                    const size = await sizeOf(target);
                    await fsp.rm(target, { recursive: true, force: true });
                    freed += size;
                    removed.push(model.name);
                } catch (error) {
                    failed.push({ name: model.name, reason: error?.message || String(error) });
                }
            }
            // Any half-finished copy of the same thing, wherever it was being written. The runtime
            // leaves both kinds behind: a partial archive, and a partial extraction directory.
            for (const dir of searched) {
                if (model.file) await fsp.rm(path.join(dir, `${model.file}.part`), { force: true }).catch(() => { });
                if (model.unpack) {
                    await fsp.rm(path.join(dir, `${model.unpack}.part`), { recursive: true, force: true }).catch(() => { });
                    await fsp.rm(path.join(dir, model.file), { force: true }).catch(() => { });
                }
            }
        }

        log.info(
            `[analysis] removeAll: deleted ${removed.length} (${Math.round(freed / 1048576)}MB)`
            + `${failed.length ? `, could not delete ${failed.map(f => f.name).join(', ')}` : ''}`,
        );
        if (removed.length > 0) onChanged?.();
        return { ok: failed.length === 0, removed, freed, failed };
    };

    /** What the dialog draws: per entry, whether it is here and where it came from. */
    const status = () => ({
        manual: manifest.manual,
        downloadDir: getDownloadDir(),
        models: ENTRIES.map(model => ({
            name: model.name,
            file: model.file ?? null,
            bytes: model.bytes ?? 0,
            enables: model.enables,
            license: model.license,
            // False only for the runtime, and only on a platform with no build - see the manifest.
            // The dialog needs the row either way: a machine that cannot run separation should be
            // told so, not left looking for a download button that was never drawn.
            supported: model.supported,
            path: model.supported ? installedPath(model) : null,
            downloading: running.has(model.name),
        })),
    });

    return { download, cancel, installLocal, removeAll, status, MODEL_NAMES };
};

module.exports = { createModelStore, fileIsModel, hashFile };
