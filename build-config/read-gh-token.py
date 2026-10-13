"""从 Windows 凭据管理器取 GitHub 凭据，供推送脚本使用。

## 为什么需要这一步

本机 PortableGit 的 **system 级** gitconfig（`PortableGit/etc/gitconfig`）写了：

    [credential]
        helper = helper-selector

`git-credential-helper-selector` 是 GUI 选择器：`credential.helperselector.selected`
没有值时就弹窗等人点。而 git 的 credential.helper 是**累积列表**，system 级排在最前，
所以永远轮不到 global 级那个真正能用的 git-credential-manager。

结果：`git push` 会停在 `git credential-helper-selector get` 上不动（GIT_TRACE 可见），
`GIT_TERMINAL_PROMPT=0` 也拦不住——它管的是终端提示，不是 GUI 弹窗。
2026-10-13 实测：一次 push 就这样挂在后台 37 分钟，8 次重试全废。

## 用法

    python build-config/read-gh-token.py <输出文件>

输出文件写两行：第 1 行用户名，第 2 行 token。
标准输出只打印脱敏摘要，凭据本体不落终端、不进日志。

配合 `git -c credential.helper=`（空值清空 helper 列表）+ 把凭据放进 URL，
即可完全绕开 helper-selector。见 build-config/push-retry.sh。
"""
import ctypes
import json
import sys
from ctypes import wintypes

TARGET = "git:https://github.com"
CRED_TYPE_GENERIC = 1


class FILETIME(ctypes.Structure):
    _fields_ = [
        ("dwLowDateTime", wintypes.DWORD),
        ("dwHighDateTime", wintypes.DWORD),
    ]


class CREDENTIAL(ctypes.Structure):
    _fields_ = [
        ("Flags", wintypes.DWORD),
        ("Type", wintypes.DWORD),
        ("TargetName", wintypes.LPWSTR),
        ("Comment", wintypes.LPWSTR),
        ("LastWritten", FILETIME),
        ("CredentialBlobSize", wintypes.DWORD),
        ("CredentialBlob", ctypes.POINTER(ctypes.c_char)),
        ("Persist", wintypes.DWORD),
        ("AttributeCount", wintypes.DWORD),
        ("Attributes", ctypes.c_void_p),
        ("TargetAlias", wintypes.LPWSTR),
        ("UserName", wintypes.LPWSTR),
    ]


def read_credential(target=TARGET):
    """返回 (user, secret)；找不到就返回 (None, None)。"""
    advapi32 = ctypes.WinDLL('advapi32', use_last_error=True)
    advapi32.CredReadW.argtypes = [
        wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
        ctypes.POINTER(ctypes.POINTER(CREDENTIAL)),
    ]
    advapi32.CredReadW.restype = wintypes.BOOL
    advapi32.CredFree.argtypes = [ctypes.c_void_p]

    ptr = ctypes.POINTER(CREDENTIAL)()
    if not advapi32.CredReadW(target, CRED_TYPE_GENERIC, 0, ctypes.byref(ptr)):
        return None, None

    cred = ptr.contents
    raw = ctypes.string_at(cred.CredentialBlob, cred.CredentialBlobSize)
    user = cred.UserName or ""
    advapi32.CredFree(ptr)

    # GCM 存的 Blob 是 UTF-16LE；老式 wincred 是 UTF-8。
    text = None
    try:
        candidate = raw.decode('utf-16-le').rstrip('\x00')
        if candidate.isprintable() and len(candidate) > 8:
            text = candidate
    except Exception:
        pass
    if text is None:
        text = raw.decode('utf-8', 'ignore').rstrip('\x00')

    # GCM 有时把整条记录存成 JSON，token 在字段里。
    if text.lstrip().startswith('{'):
        try:
            data = json.loads(text)
        except ValueError:
            data = {}
        for key in ('accessToken', 'access_token', 'password', 'token'):
            if isinstance(data.get(key), str):
                return user, data[key]

    return user, text


def main():
    if len(sys.argv) < 2:
        print("用法：python build-config/read-gh-token.py <输出文件>")
        return 2

    user, token = read_credential()
    if not token:
        print(f"NOT_FOUND 凭据管理器里没有 {TARGET}")
        return 1

    # 两行：用户名、token。调用方按行读。
    with open(sys.argv[1], 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(f"{user}\n{token}\n")

    preview = token[:4] + '…' + token[-2:] if len(token) > 8 else '(太短)'
    print(f"FOUND user={user} length={len(token)} preview={preview}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
