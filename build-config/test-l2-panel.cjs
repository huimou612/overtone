'use strict'

/*
 * L2 侧栏「当前列表」数据整形的单元测试。
 *
 * 覆盖 src/renderer/core/immersiveLyric/panel/queue.ts 的 resolveQueueView：
 *   · 空/非法输入必须安全降级（不能抛）
 *   · 当前曲的三级判定：id 命中 → playIndex 兜底 → 都不成立则不高亮
 *   · 「稍后播放」的临时曲不得用 playIndex 顶替（否则会高亮错行）
 *   · 不排序、不去重、不改入参 —— 面板展示的就是列表原样，不冒充播放顺序
 *
 * 加载方式沿用 test-immersive-lyric.cjs：Node 内置 stripTypeScriptTypes + data: URL，
 * 不引入任何构建工具或运行期依赖（该文件除 `import type` 外无 import）。
 *
 * 跑法：node build-config/test-l2-panel.cjs
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { stripTypeScriptTypes } = require('node:module')

let passed = 0
let failed = 0
function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${name}`)
    console.log(`       ${error.message.split('\n')[0]}`)
  }
}

const srcPath = rel => path.join(__dirname, '..', rel)
const loadTs = async rel => {
  const js = stripTypeScriptTypes(fs.readFileSync(srcPath(rel), 'utf8'), { mode: 'strip' })
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
}

const music = (id, name = id) => ({ id, name, singer: 's', source: 'kw' })

async function main() {
  const { resolveQueueView } = await loadTs('src/renderer/core/immersiveLyric/panel/queue.ts')

  // =========================================================================
  console.log('\n[1] 空 / 非法输入安全降级')
  // -------------------------------------------------------------------------

  test('listId 为 null（playInfo.playerListId 初始值）→ 空态', () => {
    const view = resolveQueueView([music('a')], null, 'a', 0, false)
    assert.equal(view.isEmpty, true)
    assert.equal(view.rows.length, 0)
    assert.equal(view.currentOutsideList, false)
  })

  test('listId 为空串 / 非字符串 → 空态', () => {
    assert.equal(resolveQueueView([], '', 'a', 0, false).isEmpty, true)
    assert.equal(resolveQueueView([music('a')], 123, 'a', 0, false).isEmpty, true)
    assert.equal(resolveQueueView([music('a')], {}, 'a', 0, false).isEmpty, true)
  })

  test('列表非数组 / 空数组 → 空态，不抛异常', () => {
    assert.equal(resolveQueueView(null, 'default', 'a', 0, false).isEmpty, true)
    assert.equal(resolveQueueView(undefined, 'default', 'a', 0, false).isEmpty, true)
    assert.equal(resolveQueueView('oops', 'default', 'a', 0, false).isEmpty, true)
    assert.equal(resolveQueueView([], 'default', 'a', 0, false).isEmpty, true)
  })

  // =========================================================================
  console.log('\n[2] 当前曲标记')
  // -------------------------------------------------------------------------

  test('正常列表 + id 命中：只有命中行 isCurrent，index/rowKey 正确', () => {
    const list = [music('a'), music('b'), music('c')]
    const view = resolveQueueView(list, 'default', 'b', 0, false)
    assert.equal(view.isEmpty, false)
    assert.deepEqual(view.rows.map(r => r.isCurrent), [false, true, false])
    assert.deepEqual(view.rows.map(r => r.index), [0, 1, 2])
    assert.equal(view.rows[1].rowKey, '1:b')
    assert.equal(view.currentOutsideList, false)
  })

  test('id 命中优先于 playIndex（列表被重排/插入后仍锁在同一首歌）', () => {
    const list = [music('x'), music('a'), music('b')]
    // 播放器记的 playIndex 还是 0，但当前曲已经是 b
    const view = resolveQueueView(list, 'default', 'b', 0, false)
    assert.deepEqual(view.rows.map(r => r.isCurrent), [false, false, true])
  })

  test('id 未命中但 playIndex 合法 → 退回 playIndex 高亮', () => {
    const list = [music('a'), music('b'), music('c')]
    const view = resolveQueueView(list, 'default', 'zzz', 2, false)
    assert.deepEqual(view.rows.map(r => r.isCurrent), [false, false, true])
    assert.equal(view.currentOutsideList, false)
  })

  test('「稍后播放」的临时曲：不得用 playIndex 顶替，标记 currentOutsideList', () => {
    const list = [music('a'), music('b')]
    const view = resolveQueueView(list, 'default', 'temp-1', 0, true)
    assert.deepEqual(view.rows.map(r => r.isCurrent), [false, false])
    assert.equal(view.currentOutsideList, true)
  })

  test('playIndex 越界 / 负数 / 非整数 → 不高亮且标记 currentOutsideList', () => {
    const list = [music('a'), music('b')]
    for (const idx of [5, -1, 1.5, NaN, '1', null, undefined]) {
      const view = resolveQueueView(list, 'default', 'zzz', idx, false)
      assert.deepEqual(view.rows.map(r => r.isCurrent), [false, false], `playIndex=${String(idx)}`)
      assert.equal(view.currentOutsideList, true, `playIndex=${String(idx)}`)
    }
  })

  test('没有当前曲（currentId 为空）→ 全部不高亮，且不算「不在列表内」', () => {
    for (const id of [null, undefined, '']) {
      const view = resolveQueueView([music('a')], 'default', id, 0, false)
      assert.equal(view.rows[0].isCurrent, false)
      assert.equal(view.currentOutsideList, false)
    }
  })

  // =========================================================================
  console.log('\n[3] 原样透出 / 健壮性')
  // -------------------------------------------------------------------------

  test('不排序、不去重：顺序与重复 id 原样保留', () => {
    const list = [music('c'), music('a'), music('a'), music('b')]
    const view = resolveQueueView(list, 'default', 'a', 1, false)
    assert.deepEqual(view.rows.map(r => r.music.id), ['c', 'a', 'a', 'b'])
    // findIndex 命中的是第一个 a
    assert.deepEqual(view.rows.map(r => r.isCurrent), [false, true, false, false])
  })

  test('列表含 null 项：不抛异常，rowKey 仍可用', () => {
    const list = [music('a'), null, music('b')]
    const view = resolveQueueView(list, 'default', 'b', 0, false)
    assert.equal(view.rows.length, 3)
    assert.equal(view.rows[1].rowKey, '1:')
    assert.equal(view.rows[2].isCurrent, true)
  })

  test('不修改入参（面板可安全复用同一份缓存数组）', () => {
    const list = [music('a'), music('b')]
    const snapshot = JSON.parse(JSON.stringify(list))
    resolveQueueView(list, 'default', 'a', 0, false)
    assert.deepEqual(list, snapshot)
  })

  test('rows 与 list 长度一致（虚拟列表依赖固定下标）', () => {
    const list = Array.from({ length: 200 }, (_, i) => music('m' + i))
    const view = resolveQueueView(list, 'default', 'm150', 150, false)
    assert.equal(view.rows.length, 200)
    assert.equal(view.rows.filter(r => r.isCurrent).length, 1)
    assert.equal(view.rows[150].isCurrent, true)
  })

  console.log(`\n结果：${passed} 通过，${failed} 失败\n`)
  if (failed > 0) process.exitCode = 1
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
