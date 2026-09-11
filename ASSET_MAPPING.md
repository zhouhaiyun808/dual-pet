# 已接入素材

当前按上传顺序映射：

- pet-a：陈子奚
- pet-b：江晏

## 已识别并接入
- 四向走路
- 睡觉（闭眼单帧）
- kiss-left
- kiss-right

## 暂未分配
两张原始 spritesheet 中都存在一组额外的背面序列，与“四向走路 + 睡觉 + 左右亲亲”的描述相比多出一组。
为避免误判，已拆到：

- `pet-a/unused-extra/`
- `pet-b/unused-extra/`

原始 spritesheet 也保存在每个角色目录的 `source-sheet.png`。
