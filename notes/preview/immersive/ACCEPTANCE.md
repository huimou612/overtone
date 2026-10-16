# 沉浸式动态歌词 · 验收记录（第四 / 第五阶段）

> 本文件是**新增**的独立验收记录，不改动前几阶段的历史证据。
> 基线提交：第四阶段 `b308763e`（背景系统收口）；第三阶段 `37182651`（视觉动画）。

## 一、截图证据（本目录，均已随提交入库）

| 文件 | 阶段 | 内容 |
|---|---|---|
| `20`–`27-stage3-*.png` | 三 | 长中英混排 / 长英文 / 暂停恢复 / 切歌 / reduced-motion / 恢复正常 / 当前行色块 / 逐字填充 |
| `30`–`35-stage4-*.png` | 四 | 有封面主背景 / 无封面不透明兜底 / 封面加载失败 / 切歌更新 / reduced-motion 色块 / 关闭后普通页 |
| `40-stage5-real-lrc.png` | 五 | 真实歌曲《稻香》歌词，当前行「微微笑 小时候的梦我知道」带色块，时间标签 01:03 与 63s 定位一致 |
| `41-stage5-word-fill.png` | 五 | 逐字行「乡间的歌谣 永远的依靠」（DOM 实测 done/active/todo 三段填充） |
| `42-stage5-no-lyric.png` | 五 | 无歌词降级文案「这首歌暂时没有可用的歌词」 |
| `43-stage5-playing.png` | 五 | 播放中 |
| `44-stage5-after-switch.png` | 五 | 切歌后（歌词 + 背景封面同步更新） |
| `45-stage5-normal-page.png` | 五 | 关闭沉浸后的普通播放页（歌曲列表 + 播放条）正常 |

截图均为对应阶段**实际运行**产物，非设计图。

## 二、验收脚本与日志（本地 `.git/` 内，**不作为仓库交付物**）

这些是 CDP 端到端脚本与其日志，体积大、依赖本机 dev 环境与 `.git/cover-uri.txt`，**仅作本地回归工具**，不入库：

- `.git/verify-immersive-3.js`（40 判据，第三阶段视觉）、`.git/verify-immersive-4.js`（14 判据，第四阶段背景）、`.git/verify-immersive-5.js`（20 判据，第五阶段最终验收）
- `.git/probe-*.js`（一次性聚焦探针：`probe-seek.js` 暂停定位、`probe-next.js` 下一首链路、`probe-rm-block.js` reduced-motion 色块）
- 日志：`.git/out-verify5.txt`、`.git/out-regress5.txt`、`.git/out-lint*.txt` 等
- 夹具：`.git/cover-uri.txt`（测试封面 data URI）

**建议**：保持本地。若后续需要把回归自动化纳入 CI，再单独评估将脚本改造成不依赖 `.git/` 夹具的形式后迁入 `build-config/`。

## 三、门禁与回归结果（第五阶段）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `verify-immersive-5.js`（CDP 端到端） | 0 | 20 / 0（链路 8 + 定位 1 + 切歌 2 + 生命周期 5 + reduced-motion 2 + 控制台 1 + 暂停 1） |
| `verify-immersive-3.js`（近端回归） | 0 | 40 / 0 |
| `verify-immersive-4.js`（近端回归） | 1 | 13 / 1：唯一失败＝其控件用例用 `setMusicInfo` 只设单曲、不建队列，`playNext` 因 `playerListId` 为空而**正确 no-op**；经 `probe-next.js` 塞入合法 `tempPlayList` 后点按钮实测 `CUR→NEXT2` 切歌成功 → **属测试态，非代码缺陷** |
| `npm run lint` | 0 | 0 错 |
| `npm test` | 0 | 27+27+20+28 = 102 通过 / 0 失败 |
| `npm run build:renderer` | 0 | 通过 |

## 四、环境限制（未验证项，如实标注）

本机**无音频输出设备**：

- **真实音频出声**未验证（无法建立输出流）。
- **真实播放/暂停/恢复的音频时钟**不推进：页内合成 WAV 交给 `audio.play()` 后 `audio.currentTime` 恒 0，无法验证「播放中自动推进」。故 `verify-immersive-5.js` 的 `P1/P4` 标为「环境限制，未验证」。
- 已用**真实 audio 元素时钟**驱动（`setCurrentTime` / `app_event.setProgress`，与进度条拖动同路径）验证了**时间轴与定位**：拖动后 10ms 到位；视图当前行与 `timeline` 计算行一致。
- 页内合成 WAV 的失败播放会诱发 4~8 条 `AbortError / uncaught error`（注入音频所致，非歌词链路），已在 `E1` 中排除并单独计数。

## 五、已知问题（待决策，本阶段未改源码）

1. **时间轴注释与实现不一致（边界输入）**：`timeline.ts` 文件头注释写「时间戳段数 > 3 → 丢弃」，但 `TIME_RXP` 每段最多匹配 2 个冒号，故 `[00:00:00:00.000]四段` **不会**被判为「>3 段」，而是被拆出可匹配部分、产出**一条时间为 0 的行**（实测）。仅影响畸形歌词，不崩溃。已在 `build-config/test-immersive-lyric.cjs` 里锁定现状并注明。
2. **逐字负时长（异常数据）**：`getWordFill` 不特判 `duration < 0`，`t > start` 恒返回 0、`t < start` 会返回正比例。属不该出现的数据，测试已锁定现状并注明；是否改为「负时长一律当 0」待决策。
3. `verify-immersive-4.js` 的控件点击选择器少上了一层父节点（点到 footer 而非按钮），且校验应改为「按钮调用了 `playNext`」而非「歌曲必变」——仅在本地脚本，未影响仓库。

## 六、注

单元测试（`build-config/test-immersive-lyric.cjs`，第五 / 第六阶段补测）覆盖 `timeline.ts` 与 `fill.ts` 的解析 / 定位 / 填充边界，见该文件头部说明。
