指间月光 · 独立音乐档案库（格式版本 1）

这不是歌曲音频缓存，而是可持续修订的乐谱数据。文件采用 UTF-8；Node.js 24 下可直接运行，
不需要 npm install、API Key 或外部网站。原始材料、结构化乐谱、网页兼容 MIDI 分开保存。
正式仓库：https://github.com/YinQian642/moon-fingers-piano
正式网站：https://yinqian642.github.io/moon-fingers-piano/
当前收录《月光》与《莫斯科郊外的晚上》，具体修订与统计以 catalog.json 为准。

一、入口与目录
catalog.json 是唯一曲目索引；先读取它，按其中路径找到当前修订，不能靠猜测文件名。
songs/<曲目-id>/revisions/r0001/ 下包含：
  score.json         可编辑的权威乐谱数据，格式见 schemas/score.schema.json。
  performance.json   供本项目 Transport 读取的 notes / cues / accompaniment 数据；秒单位由乐谱推算。
  full.mid           从结构化乐谱导出的完整 MIDI，保留音符的原始时值。
  web.mid            现有第 5 版网页可导入的 MIDI，第一条有音符的音轨是 Melody。
  metadata.json      曲目、修订号、来源、统计、调号、兼容性处理和每个文件的 SHA-256。
  sources/           输入的原始音频、MIDI、图片、文本等；《月光》的 .mid / .ly 已原样保存。
同一 id 的修订依次为 r0001、r0002……；旧目录不覆盖，catalog.currentRevision 指向最新版。
inbox/ 可暂放要录入的材料；examples/ 仅是格式示例，不会自动成为正式曲目。
vendor/ 是带授权说明的离线解析/编码工具。tools/v5-melody-extractor.mjs 是原项目旋律提取逻辑快照。

二、给新的扒谱对话
复制本目录的“固定工作提示词.txt”，再提供音乐材料。新对话若属于同一项目，可直接读取此库。
如果另一个智能体不在同一文件系统，给它独立曲库 ZIP 或包含曲库的完整源码 ZIP。
任何提示词都不能让一个无文件访问权的对话自动写入本地；这种情况下应交付单曲文件包，再导入此库。
完整录入任务约定、质量标注和禁止混淆的事项都在固定工作提示词中。

三、常用命令（在包含 music-library 的目录运行）
列出曲目：
  node music-library/tools/archive.mjs list
检查整库：
  node music-library/tools/archive.mjs validate
从结构化音乐文本入库：
  node music-library/tools/archive.mjs add "待入库.score.json" --source "原始材料.mp3"
  --source 可以重复；没有原始附件时可省略。输入的 score.json 本身也会保存到 sources。
从现有 MIDI 建立初稿：
  node music-library/tools/archive.mjs from-midi "乐曲.mid" --id song-id --title "曲名" --composer "作曲者" --melody-track 0
可选参数：--url、--license、--description、--notes、--status、--source。
只有重新构建内置《月光》时使用 --clair-opening，以保留其开头跨谱表的旋律音。
自动提取只是初稿，默认 needs-review；须复核旋律划分、和弦、复调和踏板。
测试档案工具：
  node --test music-library/tools/archive.test.mjs
这些命令不会启动或发布网站，不会修改手势代码和 UI。

四、乐谱语义（尤其适合文字、简谱、五线谱转录）
header.ppq 是每四分音符的 tick 数；推荐新文本用 480，原 MIDI 的 PPQ 原样保留。
以 PPQ=480 为例：四分音符480、八分音符240、附点八分音符360、八分三连音160。
起音 ticks 是从曲目开始累计的绝对位置；休止通过增加下一个音的 ticks 表达。
durationTicks 是持续时长。不能把全部音符按相同长度机械排列，也不能把多个重复音高合并。
每个音符 id 全曲唯一；同一音高重新弹奏必须有新 id。延音线合并持续时长，重新起音保持两个事件。
绝对音高用 MIDI 数字，C4=60，C#4/Db4=61，A4=69。velocity 大于0且不超过1。
每条轨道保存 name、channel、program、notes，可带 controlChanges 和 pitchBends。
当前面向有音高的钢琴演奏；不接受 MIDI 第10通道（零基 channel=9）的打击乐直接当作钢琴音符。
非钢琴曲的钢琴化编配须记录取舍，保留原材料，不能伪称是原声部逐音转录。

调号使用“fifths + mode”，而非有歧义的键名：
  C大调：0 / major；A小调：0 / minor。
  Db大调：-5 / major；C#小调：4 / minor。
拍号、速度、调号列表从 ticks=0 开始；后续变化的 ticks 严格递增。
melodyNoteIds 是明确的旋律事件清单，按时间顺序，每个起音时刻选一个主旋律音。
和弦的其余音仍留在完整 notes 中，作为 accompaniment，不能为了八个入口删掉升降音和八度。
主旋律可以跨多个原始音轨；通过 id 引用即可，不能假设“右手轨全是旋律”。

五、质量与来源
provenance 记录材料类型、来源描述、可选 URL 和授权状态；不明填 unknown，不代替用户作法律判断。
quality.status：draft（初稿）、needs-review（待核对）、ready（已完成所声明的核对）。
quality.uncertainSpans 用 startTicks、endTicks、reason 标记不确定段落。
有未解决的不确定段落时不能标 ready。程序校验通过不等于完整音频扒谱准确，也不等于人工试听通过。
《月光》档案以原有 MIDI 为准，旋律清单复现 v5 提取结果，人工声部核对仍标 needs-review。

六、与现有网页的连接
最快用法：在网页点“导入乐曲”，选择对应修订中的 web.mid，旋律音轨选 Melody（通常序号0）。
每个旋律事件会独立保留，梦想模式的音高与节奏入口来自同一事件序列。
新曲已通过 performance.json 直接连接网页曲库，不再重复提取旋律。
运行 npm run prepare:site 可按 catalog.json 生成网页运行数据；推送 main 后 GitHub Actions 自动执行生成、校验与发布。
网站只发布 dist，根目录 music-library 完整资料存于 GitHub，可被其他智能体直接读取。
《月光》当前保持原先内置 MIDI 播放，其档案修订留供后续单独核对接入。

web.mid 的兼容处理：现有 v5 导入器会过滤上一旋律长音下的较低音。为了不漏掉手工指定的连奏或复调旋律，
web.mid 只在后一个旋律音较低或相同时，将有冲突的重叠时值裁至下一起音，metadata.webAdaptation 逐音记录。完整时值保存在
score.json、full.mid 和 performance.json，原始 sources 文件也不受影响。
网页目前未实现 MIDI 踏板、弯音和多乐器播放，资料可以存档，但当前钢琴播放器不会全部呈现。

七、现有《月光》调号记录
原 .ly 乐谱和 MIDI 中段为 C# 小调（4个升号）。v5 使用的旧 MIDI 解析接口把这一调号标成关系大调 E 的
键名并同时标 minor，易被误读成 E 小调。本库保存原始 fifths，并在 performance.json 使用实际 C# 小调主音；
音符的实际 MIDI 音高与起音未改变。旧网页源码保留原样，所以通过旧导入器播放时，其唱名映射仍可能继承
旧调号解释；直接使用档案 performance.json 可避开此歧义。这不是把原曲转调。

八、完整性和并发
每次成功入库先生成完整修订目录，再更新 catalog。写入使用 .archive.lock 防止两个智能体同时覆盖索引。
如果另一进程正在写入，等待其结束再重试。只有确认写入进程已退出后，才能处理遗留锁文件。
不要直接编辑历史修订和派生 MIDI；复制 score.json 到 inbox 修订，再通过 add 创建新版本。
validate 会核对文件摘要、音符分配、MIDI 往返、显式旋律与 web.mid 的一致性。

当前《月光》最新版为 r0002，其 web.mid 无需裁短任何旋律音，保留全部 1,468 个音符的起音与时值；r0001 保留为初次兼容导出的历史记录。
