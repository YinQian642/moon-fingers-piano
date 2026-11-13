# 指间月光：共同维护约定

- 唯一正式仓库：https://github.com/YinQian642/moon-fingers-piano
- 唯一正式网站：https://yinqian642.github.io/moon-fingers-piano/
- 用户已明确要求：所有音乐、演奏模式、UI 修改都提交到此仓库并更新此网站。旧 ChatGPT Sites 地址已弃用，不再向旧项目发布；不要复制旧 `.openai/hosting.json`。
- 工作前先读取并同步远端 `main`，保留合作者新增内容，不强制覆盖远端。网站内容位于 `dist/`，由 GitHub Actions 校验和部署。Pages Source 使用 GitHub Actions；`gh-pages` 仅作迁移记录。每次正式发布须检查对应提交的云端验证与 deploy 成功。
- 音乐权威档案位于 `music-library/`。从 `catalog.json` 查找修订；旧修订不得覆盖。使用 `node scripts/sync-song.mjs music-library <song-id>` 接入网站，不重新从 MIDI 猜测已标注的旋律。档案工具、固定录入提示词与示例随仓库保存。
- 保留三种模式：自由演奏的 C4–C5；音乐引导的原曲音高及指法提示；梦想模式每次独立触碰只推进一个旋律事件、伴奏可选。同音重复不得合并。未经任务授权不要调整手势阈值、音色、UI 或音符内容。
- 发布前运行 `npm run prepare:site`、`npm test`、`npm run verify`；涉及网页交互时运行相应浏览器测试。推送 main 后 Actions 会重复生成与验证，无需本机常驻。自动化模型测试不代表真人手势识别率或音乐听感已获验证。
- `docs/v5-*`、原有截图及 `VERIFICATION.md` 是历史复刻记录；当前代码以 `main` 为准。具体发布方法见 README。
- 不把凭据、node_modules、浏览器用户目录、临时文件、完整备份 ZIP 提交到仓库。仅发布 `dist/` 到网页。
- 钢琴与琵琶曲库独立：钢琴 `music-library/catalog.json`；琵琶 `music-library/pipa/catalog.json`，使用 `scripts/pipa-library.mjs` 入库。两种乐器均保留自由演奏、音乐引导、梦想模式。默认进入钢琴；琵琶梦想模式同一次连续扫弦只推进一音。不得因切换乐器或钢琴选曲而覆盖另一乐器的曲目。
