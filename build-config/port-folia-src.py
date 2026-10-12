"""把 Folia 的参考源码移植进 src/main/modules/ai/。

原则：**逐字移植**，只做三类必要改动，并在文件头注明，方便日后同步上游。
  1. require 路径（Folia 的目录结构 → 本项目的目录结构）
  2. .mjs → .cjs 的模块语法（主进程是 webpack 打包的 CJS 环境，动态 import 会带来
     不必要的解析风险，改成静态 require）
  3. 加版权头（AGPL-3.0 归属义务）

用法：python build-config/port-folia-src.py
"""
import io
import os
import re
import sys

SRC = 'docs/development/notes/folia-src'
DST = 'src/main/modules/ai'

HEADER = """/*
 * Ported from chthollyphile/folia-major (AGPL-3.0) — modified for 泛音 / Overtone.
 * Original: https://github.com/chthollyphile/folia-major
 * Upstream path: {upstream}
 *
 * 本文件为逐字移植。相对上游的全部改动只有以下 {nchanges} 类：
{changes}
 * 保持与上游同构，是为了日后同步上游改动时能直接 diff。
 */
"""


def header(upstream, changes):
    body = ''.join(f' *   - {c}\n' for c in changes) if changes else ' *   （无）\n'
    return HEADER.format(upstream=upstream, nchanges=len(changes), changes=body)


def read(name):
    return io.open(os.path.join(SRC, name), encoding='utf-8').read()


def write(name, text):
    p = os.path.join(DST, name)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(text)
    n = len(text.splitlines())
    print(f'  -> {p}  ({n} lines, {len(text)} chars)')


def ensure_dst():
    os.makedirs(DST, exist_ok=True)


# --------------------------------------------------------------------------
# 1. lyricSegmentationPrompt.cjs -> segmentation.cjs（零改动）
# --------------------------------------------------------------------------
def port_segmentation():
    txt = read('lyricSegmentationPrompt.cjs')
    changes = []
    txt = header('shared/lyricSegmentationPrompt.cjs', changes) + txt
    write('segmentation.cjs', txt)


# --------------------------------------------------------------------------
# 2. aiCredentialStore.cjs -> credentialStore.cjs（改 require + 加 export）
# --------------------------------------------------------------------------
def port_credential_store():
    txt = read('aiCredentialStore.cjs')
    changes = []
    old = "require('./aiTextClient.cjs')"
    new = "require('./textClient.cjs')"
    if old in txt:
        txt = txt.replace(old, new)
        changes.append(f"require {old} -> {new}")
    # 上游的 exports 里没有 isReservedAiCredentialKey 之外的补充，原样
    txt = header('electron/aiCredentialStore.cjs', changes) + txt
    write('credentialStore.cjs', txt)


# --------------------------------------------------------------------------
# 3. aiTextClient.cjs -> textClient.cjs（改 require + 动态 import -> require）
# --------------------------------------------------------------------------
def port_text_client():
    txt = read('aiTextClient.cjs')
    changes = []
    pairs = [
        ("require('../shared/lyricSegmentationPrompt.cjs')",
         "require('./segmentation.cjs')"),
        ("await import('../shared/openAICompatibleRequest.mjs')",
         "require('./openAICompatibleRequest.cjs')"),
        ("const { rejectsOpenAICompatibleParameter } = require('./openAICompatibleRequest.cjs');",
         "const { rejectsOpenAICompatibleParameter } = require('./openAICompatibleRequest.cjs');"),
    ]
    for old, new in pairs:
        if old == new:
            continue
        if old in txt:
            txt = txt.replace(old, new)
            changes.append(f"require/import 路径：{old} -> {new}")
    txt = header('electron/aiTextClient.cjs', changes) + txt
    write('textClient.cjs', txt)


# --------------------------------------------------------------------------
# 4. openAICompatibleRequest.mjs -> openAICompatibleRequest.cjs（ESM -> CJS）
# --------------------------------------------------------------------------
MJS_EXPORTS = [
    'resetOpenAICompatibleCapabilities',
    'detectOpenAICompatibleProvider',
    'rejectsOpenAICompatibleParameter',
    'sendOpenAICompatibleRequest',
]


def port_openai_request():
    txt = read('openAICompatibleRequest.mjs')
    changes = []

    # ESM -> CJS：去掉 export 关键字，函数/常量名保持不变
    n = len(re.findall(r'^export const ', txt, flags=re.M))
    txt = re.sub(r'^export const ', 'const ', txt, flags=re.M)
    n2 = len(re.findall(r'^export class ', txt, flags=re.M))
    txt = re.sub(r'^export class ', 'class ', txt, flags=re.M)
    n3 = len(re.findall(r'^export function ', txt, flags=re.M))
    txt = re.sub(r'^export function ', 'function ', txt, flags=re.M)
    n4 = len(re.findall(r'^export async function ', txt, flags=re.M))
    txt = re.sub(r'^export async function ', 'async function ', txt, flags=re.M)
    total = n + n2 + n3 + n4
    if total:
        changes.append(f'{total} 处 `export const/class/function` 去掉 export，'
                       '改为文件末尾统一 module.exports（ESM -> CJS）')

    missing = [name for name in MJS_EXPORTS if not re.search(rf'^(const|function|async function|class) {name}\b', txt, flags=re.M)]
    if missing:
        raise SystemExit('端口失败：以下导出在转换后找不到定义 -> ' + ', '.join(missing))

    exports = ',\n  '.join(MJS_EXPORTS)
    txt = txt.rstrip('\n') + f'''

module.exports = {{
  {exports},
}}
'''
    changes.append('文件末尾补 module.exports')

    head = header('shared/openAICompatibleRequest.mjs', changes)
    # 上游第一行是注释，把头部插到最前面即可
    write('openAICompatibleRequest.cjs', head + txt)


def main():
    if not os.path.isdir(SRC):
        raise SystemExit(f'找不到上游参考源码目录：{SRC}')
    ensure_dst()
    print('移植 Folia 源码 ->', DST)
    port_segmentation()
    port_credential_store()
    port_text_client()
    port_openai_request()
    print('\n完成。')


if __name__ == '__main__':
    main()
