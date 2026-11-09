# 住宿登记 · 白蓝原生界面

## Context

登记人员在明亮的接待区域，用 iPhone 微信浏览器单手录入和查找入住信息。浅色界面保证白天可读性；蓝色仅用于主操作、选中和链接。

## Visual Theme

清爽的 iOS 应用：白色表面、淡冷灰背景、近黑正文、单一蓝色强调。取消旧版深色品牌栏、橙色按钮、英文小标题和分组编号。界面通过间距、字号和分隔线建立层级。

## Color

- Background: #F4F6FA
- Surface: #FFFFFF
- Ink: #17233C
- Secondary: #59667D
- Muted / placeholder: #59667D
- Accent: #1260DE
- Accent surface: #EAF2FF
- Separator: #E5EAF2
- Error: #BD3142

## Typography

系统字体，优先 -apple-system / BlinkMacSystemFont / PingFang SC。首页主标题 30px / 700；导航标题 18px / 650；订单标题 16px / 650；输入 16px；次要说明 13px。数字使用 tabular-nums。

## Components

- 白色导航与本机备份入口；主操作是蓝色新增登记。
- 订单使用独立可操作记录，主标题、日期、客户及房型分层展示；完整费用直接可读。
- 搜索、入住状态筛选、空状态使用同一视觉语言。
- 登记作为独立全屏页面，取消、分组列表、固定保存操作符合手机习惯。
- 备份页提供复制当前备份和粘贴合并导入，明确当前设备的数据边界。
- 统一 24px / 1.8 stroke 的线性功能图标，无外部运行时依赖。

## Layout and Motion

4px 间距体系；手机水平边距 20px，窄屏 16px；表面圆角 12–16px。平板与桌面限制内容宽度，订单列表在足够空间时分列。切换页面和保存反馈使用 180–220ms ease-out 动画，减少动画设置下立即显示。
