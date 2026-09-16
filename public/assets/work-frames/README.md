# 工作陪伴循环帧

正式运行资源。所有图片均为 1024 × 536 RGBA PNG；同一场景共用固定裁切框，播放时只切换完整图片，不叠加程序绘制内容。

## 单人陈子奚

- `00-idle.png`：母帧
- `03-blink-closed.png`：闭眼
- `06-stroke-mid.png`：落笔

## 单人江晏

- `00-idle.png`：母帧
- `03-blink-closed.png`：闭眼
- `06-book-closed.png`：合书

## 双人共同工作

- `00-idle.png`：母帧
- `04-chen-stroke-mid.png`：陈子奚落笔
- `08-chen-blink-closed.png`：陈子奚闭眼
- `11-jiang-book-closed.png`：江晏合书
- `12-jiang-blink-closed.png`：江晏闭眼

双人动作按顺序独立播放，不同时触发，因此无需组合动作帧。翻页方案已由合书动作替代。
