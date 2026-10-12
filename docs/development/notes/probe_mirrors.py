import os, subprocess, time, json

GIT = r"D:/workbuy/WorkBuddy/resources/vendor/PortableGit/mingw64/bin/git.exe"
if not os.path.exists(GIT):
    GIT = "git"

RAW = "https://github.com/lyswhut/lx-music-desktop.git"

CANDIDATES = [
    ("github-direct",        RAW,                                              "direct"),
    ("github-proxy",         RAW,                                              "proxy"),
    ("gitee-mirrors",        "https://gitee.com/mirrors/lx-music-desktop.git", "both"),
    ("gitcode-ghmirrors",    "https://gitcode.com/gh_mirrors/lx/lx-music-desktop.git", "both"),
    ("gitclone",             "https://gitclone.com/github.com/lyswhut/lx-music-desktop.git", "both"),
    ("kkgithub",             "https://kkgithub.com/lyswhut/lx-music-desktop.git", "proxy"),
    ("ghproxy.net",          "https://ghproxy.net/https://github.com/lyswhut/lx-music-desktop.git", "proxy"),
    ("gh-proxy.com",         "https://gh-proxy.com/https://github.com/lyswhut/lx-music-desktop.git", "proxy"),
    ("ghfast.top",           "https://ghfast.top/https://github.com/lyswhut/lx-music-desktop.git", "proxy"),
]

PROXY_KEYS = ["http_proxy","https_proxy","HTTP_PROXY","HTTPS_PROXY","ALL_PROXY","all_proxy"]

def make_env(mode):
    e = dict(os.environ)
    e["GIT_TERMINAL_PROMPT"] = "0"
    e["GIT_ASKPASS"] = "echo"
    if mode == "direct":
        for k in PROXY_KEYS:
            e.pop(k, None)
    return e

results = []
for name, url, mode in CANDIDATES:
    modes = ["direct","proxy"] if mode == "both" else [mode]
    for m in modes:
        label = f"{name}[{m}]"
        t0 = time.time()
        try:
            p = subprocess.run(
                [GIT, "ls-remote", "--heads", url],
                capture_output=True, env=make_env(m), timeout=40,
                encoding="utf-8", errors="replace",
            )
            dt = time.time() - t0
            if p.returncode == 0:
                heads = len([l for l in (p.stdout or "").splitlines() if l.strip()])
                results.append((label, "OK", f"{dt:.1f}s heads={heads}", url))
            else:
                err = (p.stderr or "").strip().splitlines()
                err = err[-1][:110] if err else f"exit={p.returncode}"
                results.append((label, "FAIL", f"{dt:.1f}s {err}", url))
        except subprocess.TimeoutExpired:
            results.append((label, "TIMEOUT", "40s", url))
        except Exception as ex:
            results.append((label, "ERROR", str(ex)[:110], url))

print(f"{'候选':<26} {'结果':<8} 详情")
print("-" * 100)
for label, st, detail, url in results:
    mark = "✅" if st == "OK" else "❌"
    print(f"{mark} {label:<24} {detail}")

ok = [r for r in results if r[1] == "OK"]
print("\n可达源:", [r[0] for r in ok] or "无")
