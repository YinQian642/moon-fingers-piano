# 指间月光 · 手势钢琴

正式网站：[GitHub Pages](https://yinqian642.github.io/moon-fingers-piano/) · 唯一共享仓库：[YinQian642/moon-fingers-piano](https://github.com/YinQian642/moon-fingers-piano)

全部音乐、模式、UI、手势代码及交接资料均在本仓库维护。原 ChatGPT Sites 地址已弃用。本机目录只作可替换的工作副本；无需原作者电脑即可读取源码、复核音乐、继续开发和发布。

## 从哪里开始

- 新接手的智能体：先读 [AGENTS.md](AGENTS.md) 和 [交接大纲](docs/交接大纲.md)。
- 录入音乐：读 [固定工作提示词](music-library/固定工作提示词.txt)、[曲库说明](music-library/README.txt)、[曲目索引](music-library/catalog.json)。
- 修改网页：`dist/` 包含全部网页代码、识别模型、WASM、钢琴采样与运行曲库。
- 浏览器开发：从仓库的 **Code → Codespaces** 创建环境，依赖安装后运行 `npm start`，打开 4192 转发端口预览。提交推送后由 Actions 检查与部署。Codespaces 由 GitHub 账户额度管理，本仓库未替用户创建实例。

## 当前曲目与模式

| 曲目 | 网页版本 | 音符 / 旋律事件 | 原谱时长 |
| --- | --- | --- | --- |
| 德彪西《月光》 | 保留第 5 版 MIDI 播放；档案另存 r0001、r0002 | 1,468 / 306 | 322.5 秒 |
| 《莫斯科郊外的晚上》EOP 1024 钢琴版 | 显式旋律档案 r0001，A 小调 | 199 / 58 | 31.25 秒 |

《莫斯科郊外的晚上》按用户存入的版本接入，并非完整商业录音转写。档案标记 `needs-review`，琶音时序与反复展开仍待试听。《月光》档案也保留声部复核标记。

自由演奏使用 C4–C5 钢琴音；音乐引导按照原曲音高和指法提示推进；梦想模式由每次独立触碰推进一枚旋律音，伴奏默认关闭、可自行开启。重复同音逐次触发。按键从左至右对应左手小指至食指、右手食指至小指；也支持鼠标和 `A S D F / J K L ;`。

## 完全通过 GitHub 继续工作

`main` 是源码与音乐档案的权威分支。`.github/workflows/pages.yml` 在推送 `main` 时校验档案、生成网站曲库、执行测试并把 `dist/` 部署到 GitHub Pages；PR 运行验证但不发布。无需本机长期运行服务。

仓库 **Settings → Pages → Build and deployment → Source** 应设为 **GitHub Actions**。发布状态见 **Actions → Validate and deploy piano**；deploy 成功才表示网站已更新，推送成功不等于上线。原 `gh-pages` 保留作迁移记录，启用 Actions 后不再手工维护两套网页。

新歌在 `music-library/` 形成完整、校验通过的档案后，云端构建自动接入曲库。《月光》继续使用已有播放版本，切换到档案版本需另行核对。`dist/assets/music-library/` 是可再生成的发布数据，`music-library/` 是权威乐谱与来源。

协作前同步最新 `main`。遇到远端更新，应合并合作者修改，禁止强推覆盖。音乐旧修订不可覆盖；新修改由归档工具生成修订。无写权限的智能体应交付补丁或 PR，明确尚未发布。

## 可选的本地运行与验证

仅运行网页不需要安装依赖：`node serve.mjs`，打开 `http://127.0.0.1:4192`。也可用 `启动复刻网页.cmd`。摄像头需 HTTPS 或 localhost，不能直接双击 HTML。

开发验证使用 Node.js 24：

```bash
npm ci
npm run prepare:site
npm test
npm run verify
npm start
# 另一个终端，使用已安装的 Chrome：
npm run test:library
```

`prepare:site` 校验档案、同步新歌、更新运行时 SHA-256 清单。单曲同步：`node scripts/sync-song.mjs music-library <song-id>`。新曲浏览器测试支持 `TEST_URL`、`CHROME_PATH` 环境变量；旧无依赖浏览器测试保留为 `npm run test:browser`。

自动测试不能证明真人手势识别准确率或音乐已完成试听。原 26 项复刻记录及截图见 [VERIFICATION.md](VERIFICATION.md)，属于历史记录。

## 文件与历史

`dist/` 为网页；`music-library/` 为档案、来源及规范；`scripts/` 为生成工具；`tests/` 为测试；`.github/` 为云端验证和部署；`.devcontainer/` 为 Codespaces 环境；`docs/` 为交接与历史说明。

`MANIFEST.sha256.json` 校验当前运行文件。`docs/v5-MANIFEST.sha256.json`、`docs/v5-SNAPSHOT.json`、`docs/v5-复刻说明.md` 保留初次复刻记录。当前更新以 Git 历史为准。

## 来源

《月光》来自 Mutopia Project #1778，Keith OHara 制谱，原谱和 MIDI 标为 Public Domain。新曲为用户归档的 EOP 1024 钢琴谱，来源、质量、授权状态保存在修订的 `score.json` 与 `metadata.json`。钢琴采样为 Salamander Grand Piano / Alexander Holm（CC BY 3.0）；MediaPipe、MIDI 库授权随 `assets/`、`vendor/` 保留。技术细节见 [当前技术说明](docs/当前技术说明.md)。
