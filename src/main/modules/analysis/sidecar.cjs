const { spawn } = require('child_process');
const path = require('path');

// src/main/modules/analysis/sidecar.cjs
// Runs one htdemucs separation in the downloaded Python runtime and writes the two exports.
//
// Adapted from Folia's electron/analysis/sidecar.cjs (AGPL-3.0). The shape is the same - spawn,
// await, report - but the contract is not, and it is worth saying why rather than pretending this
// is a copy:
//
//   Upstream separates a 30-SECOND window for a crossfade, so it can afford to hand the stems
//   back as raw Float32Arrays over a temp file: 21MB out, and the JS side owns the DSP result.
//   We separate WHOLE SONGS, where the same return path is 254MB of floats that JS would hold in
//   heap only to re-encode into a file. So the runner writes the WAVs itself and this file's job
//   shrinks to three things: spawn it, turn its stdout into progress, and surface why it failed.
//
// Plain node, no 'electron', so this stays requireable from a test or a script.
//
// Spawning a child and awaiting its exit is genuinely async, unlike onnxruntime-node's run() - the
// CPU work happens in another OS process, so the event loop that spawned it stays free. That is
// what lets the memory win cost nothing here: the peak is the child's, and it is gone when it exits.

/**
 * Ships with the app, versioned beside this file - our code, not part of the downloaded runtime.
 *
 * The .py is handed to an external python.exe, which cannot read an asar archive. In a packaged build
 * this file lives inside app.asar, so the script is listed in build.asarUnpack and its path rewritten
 * to the unpacked copy - the standard trick for feeding an asar-bundled file to an outside process. In
 * dev there is no `app.asar` in the path and the replace is a no-op.
 */
const RUNNER_SCRIPT = path.join(__dirname, 'stems_runner.py')
    .replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');

/**
 * A hung separation should not wedge the queue forever.
 *
 * Upstream's 120s is sized for a 40s window. Ours has to cover a whole song, and the honest way to
 * say that is in seconds of audio rather than a bigger constant: the model spends roughly a third
 * of a second of CPU per second of audio, so allowing four times realtime plus a minute of slack
 * leaves a slow machine and a cold model load plenty of room while still catching a process that
 * has actually stopped. This is the line for "not running", not a performance target.
 */
const timeoutFor = (total) => Math.round(60_000 + (total / 44100) * 4_000);

/** Kept for the failure message. The last lines are the ones that say what went wrong. */
const TAIL_CHARS = 600;

/**
 * Runs the runner once and resolves with its summary line, or rejects with why it did not.
 *
 * Two things are easy to get wrong once they are tangled together, so they are not: stdout is a
 * PROGRESS channel rather than data (every line is JSON, one per chunk, then one summary), and a
 * successful run still has to say what it cost - logging only failures is what let a 4GB spike run
 * unmeasured for a day upstream.
 */
const runStems = ({
    pythonExe, modelPath, inputPath, vocalsPath, accompanimentPath, total,
    onProgress, signal,
}) => new Promise((resolve, reject) => {
    if (!pythonExe) { reject(new Error('no python runtime installed')); return; }
    if (!Number.isFinite(total) || total <= 0) { reject(new Error(`bad sample count ${total}`)); return; }

    const args = [RUNNER_SCRIPT, inputPath, vocalsPath, accompanimentPath, String(total), modelPath];
    const child = spawn(pythonExe, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

    let tail = '';
    let stats = null;
    const keep = (text) => { tail = (tail + text).slice(-TAIL_CHARS); };

    const timeoutMs = timeoutFor(total);
    const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`stems runner timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    timer.unref?.();

    const onAbort = () => child.kill();
    signal?.addEventListener('abort', onAbort, { once: true });

    // Line-buffered rather than chunk-looked-at: a chunk boundary lands mid-JSON often enough that
    // parsing raw chunks works in testing and drops every second progress event in production.
    let buffered = '';
    child.stdout.on('data', (chunk) => {
        buffered += String(chunk);
        let newline = buffered.indexOf('\n');
        while (newline !== -1) {
            const line = buffered.slice(0, newline).trim();
            buffered = buffered.slice(newline + 1);
            newline = buffered.indexOf('\n');
            if (!line) continue;
            let parsed = null;
            try { parsed = JSON.parse(line); } catch { keep(line); continue; }
            if (parsed.done) { stats = parsed; continue; }
            if (typeof parsed.progress === 'number') onProgress?.(parsed);
        }
    });
    // stderr is forwarded rather than swallowed: the sidecar's stderr is where a numpy/onnxruntime
    // import failure shows up, and a silent one reads as "the model is broken".
    child.stderr.on('data', (chunk) => keep(String(chunk)));

    child.on('error', (error) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(error);
    });
    child.on('close', (code) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (code !== 0) {
            reject(new Error(`stems runner exited ${code}: ${tail.trim().slice(-400)}`));
            return;
        }
        if (!stats) {
            reject(new Error(`stems runner wrote no summary: ${tail.trim().slice(-400)}`));
            return;
        }
        resolve({ stats, tail: tail.trim().slice(-400) });
    });
});

module.exports = { runStems, RUNNER_SCRIPT, timeoutFor };
