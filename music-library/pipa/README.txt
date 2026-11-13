琵琶独立曲库

本目录的 catalog.json 是琵琶曲目的唯一索引。父目录 music-library/catalog.json
仍是钢琴曲库。两者分别生成 dist/assets/pipa-library/ 与 dist/assets/music-library/，
不要把琵琶曲目再登记到父索引，也不要把钢琴目录里的曲目自动复制进来。

当前《茉莉花》jasmine-pipa / r0001：江苏民歌，E 调、4/4，77 个旋律事件，
16 个本项目自编的稀疏低音，共 93 音。乐谱基于湖南艺术职业学院公开材料 PDF
第 30 页单旋律简谱；来源 URL、简化项、试听待核对项均在 score.json。
这是琵琶交互试奏编配，不是专业琵琶独奏录音或完整演奏法转写。

沿用 ../schemas/score.schema.json 和 ../固定工作提示词.txt 的乐谱格式与质量约定，
但入库必须使用以下独立入口（在仓库根目录执行）：

  node scripts/pipa-library.mjs add music-library/pipa/inbox/新曲.score.json
  node scripts/pipa-library.mjs validate
  npm run prepare:site

add 自动保存输入 score.json 为来源，并生成不可覆盖的新修订、MIDI、performance
和摘要。网页直接读取 performance 的显式旋律，不重新从 MIDI 猜测主旋律。
若有录音/图片等原始材料，用 archive.mjs 导出的 saveRevision API 的 sources 参数
一并存入，root 必须指向本目录；不要把这些材料仅留在本机。

引导模式在运行时把原有八级指法成对对应到四弦：Do/Re→四弦、Mi/Fa→三弦、
Sol/La→二弦、Si/高Do→一弦。音名、实际八度和升降音仍取原谱，存档不被改写。
这是便于试奏的自动音高映射，不代表真实琵琶的按品指法。梦想模式无需匹配弦。
