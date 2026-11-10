import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const folder = dirname(fileURLToPath(import.meta.url));
const h5 = resolve(folder, '../h5');
const args = process.argv.slice(2);
const override = args.indexOf('--wrangler');
const outputOverride = args.indexOf('--outdir');
const wrangler = override >= 0 ? resolve(args[override + 1] || '') : resolve(folder, 'node_modules/wrangler/bin/wrangler.js');
const environment = { ...process.env, WRANGLER_SEND_METRICS: 'false' };

function run(parameters, interactive = false, cwd = folder) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [wrangler, ...parameters], {
      cwd, env: environment, windowsHide: true,
      stdio: interactive ? 'inherit' : ['inherit', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout?.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
    child.stderr?.on('data', chunk => process.stderr.write(chunk));
    child.once('error', reject);
    child.once('close', code => code === 0 ? accept(output) : reject(new Error('Cloudflare 命令未完成，退出码 ' + code + '；本机登记数据未改动。')));
  });
}

async function check(endpoint, origin) {
  let failure;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(endpoint + '/health', { headers: { Origin: origin }, signal: AbortSignal.timeout(15000) });
      if (!response.ok || response.headers.get('Access-Control-Allow-Origin') !== origin || (await response.json()).service !== 'inn-encrypted-sync') throw new Error('同步服务健康检查未通过');
      const preflight = await fetch(endpoint + '/v1/spaces/' + 'A'.repeat(43), {
        method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' },
        signal: AbortSignal.timeout(15000)
      });
      if (preflight.status !== 204 || preflight.headers.get('Access-Control-Allow-Origin') !== origin) throw new Error('同步服务跨设备连接检查未通过');
      return;
    } catch (error) { failure = error; if (attempt < 3) await new Promise(accept => setTimeout(accept, 2000)); }
  }
  throw failure;
}

async function main() {
  if (!existsSync(wrangler)) throw new Error('请先在 cloud 目录运行 npm ci。');
  const config = JSON.parse(readFileSync(resolve(folder, 'wrangler.jsonc'), 'utf8'));
  const origin = config.vars.ALLOWED_ORIGINS.split(',')[0].trim();
  if (new URL(origin).protocol !== 'https:') throw new Error('登记页面需要 HTTPS 地址。');
  if (args.includes('--dry-run')) {
    await run(['deploy', '--dry-run', '--config', resolve(folder, 'wrangler.jsonc'), '--outdir', outputOverride >= 0 ? resolve(args[outputOverride + 1]) : resolve(folder, 'dist')]);
    console.log('PASS：同步服务可构建；尚未登录、上传或修改网页连接配置。');
    return;
  }
  const provided = args.indexOf('--endpoint');
  let endpoint;
  if (provided >= 0) {
    endpoint = new URL(args[provided + 1]).origin;
    if (!endpoint.startsWith('https://')) throw new Error('同步服务必须使用 HTTPS。');
  } else {
    if (!environment.CLOUDFLARE_API_TOKEN && !args.includes('--reuse-login')) {
      console.log('请在打开的浏览器中登录 Cloudflare 免费账号并授权。密码只在 Cloudflare 页面输入。');
      await run(['login'], true);
    }
    await run(['deploy', '--config', resolve(folder, 'wrangler.jsonc')]);
    const gateway = resolve(folder, 'gateway');
    const name = JSON.parse(readFileSync(resolve(gateway, 'wrangler.jsonc'), 'utf8')).name;
    const projects = JSON.parse(await run(['pages', 'project', 'list', '--json'], false, gateway));
    if (!projects.some(item => item['Project Name'] === name)) {
      await run(['pages', 'project', 'create', name, '--production-branch', 'main', '--compatibility-date', config.compatibility_date, '--force'], false, gateway);
    }
    await run(['pages', 'deploy', 'site', '--project-name', name, '--branch', 'main', '--commit-dirty=true'], false, gateway);
    const updated = JSON.parse(await run(['pages', 'project', 'list', '--json'], false, gateway));
    const project = updated.find(item => item['Project Name'] === name);
    if (!project || !project['Project Domains']) throw new Error('部署完成但没有返回同步入口域名，网页连接配置未改动。');
    endpoint = 'https://' + project['Project Domains'].split(',')[0].trim();
  }
  await check(endpoint, origin);
  const version = 'sync-10-' + Date.now();
  const files = new Map([
    [resolve(h5, 'sync-config.js'), 'window.InnCloudConfig = Object.freeze({ endpoint: ' + JSON.stringify(endpoint) + ' });\n'],
    [resolve(h5, 'index.html'), readFileSync(resolve(h5, 'index.html'), 'utf8').replace(/\?v=sync-10(?:-\d+)?/g, '?v=' + version)]
  ]);
  for (const [file, content] of files) { writeFileSync(file + '.tmp', content); renameSync(file + '.tmp', file); }
  writeFileSync(resolve(folder, 'deployment.json'), JSON.stringify({ endpoint, origin, verifiedAt: new Date().toISOString(), version }, null, 2) + '\n');
  console.log('PASS：云端健康检查和连接检查通过，网页已写入真实同步地址：' + endpoint);
  console.log('下一步发布更新后的 h5 目录；第一台设备创建空间，其他设备使用配对码加入。');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
