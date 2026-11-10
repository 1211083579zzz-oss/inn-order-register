# 连接托管同步

网页继续使用现有 GitHub Pages 地址，以保留同一浏览器中的登记数据。此目录只部署加密同步接口，不接收明文住客信息。

1. 在 https://dash.cloudflare.com/sign-up 注册免费账号并完成邮箱验证。
2. 安装 Node.js 22 或更新版本，在此目录运行：

```powershell
npm ci
npm run check
npm run connect
```

`connect` 打开 Cloudflare 官方登录页，登录并授权后部署 Worker、SQLite Durable Object 和 Pages 同步入口。Pages 通过 Cloudflare 内部服务绑定访问 Worker，网页不依赖设备直连 `workers.dev`。无需先购买域名或服务器。脚本检查线上 `/health` 和跨域连接成功后，才将返回的真实 HTTPS 地址写入 `../h5/sync-config.js`，并更新页面文件版本。没有完成登录、部署或检查时会报出实际错误，不会假装已连接。

最后通过现有 GitHub Pages 发布流程发布更新后的 `h5/`。运行 `connect` 成功不代表 GitHub Pages 已更新；网页发布后还需验证实际地址和双设备同步。`deployment.json` 只记录公开服务地址、网页来源和验证时间，不记录凭据。

## 配置

`wrangler.jsonc` 已限制网页来源为 `https://1211083579zzz-oss.github.io`。更换网页域名时同步更新 `ALLOWED_ORIGINS`；多个来源用逗号分隔。所有设备必须打开相同网页地址，并通过配对码加入同一空间。

同步仅在链接版生效，原生微信小程序仍保持本机存储。网页关闭后不继续后台同步。免费额度、可访问性与实际设备体验应在上线后核查；不使用付费资源或自动开通付费套餐。

部署已存在并已核实地址时可运行 `node connect.mjs --endpoint https://inn-order-register-sync.pages.dev`，只检查服务并更新客户端配置，不重复部署或登录。使用已保存的授权重新部署时加 `--reuse-login`。

## 本地验证

`npm run dev` 在本机启动 Worker；客户端只允许 HTTPS 或 localhost/127.0.0.1。项目的 `tests/sync.test.cjs` 验证字段合并、冲突解决、删除、公司归属及加密篡改检查。事务目录中的 `verify-cloud-sync.cjs` 使用真实 Worker 本地运行时和多个独立浏览器存储进行集成验证。
