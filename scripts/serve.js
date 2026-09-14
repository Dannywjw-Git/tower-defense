// 本地静态预览服务器 —— node scripts/serve.js [port]
//
// 用途：ES modules 无法从 file:// 加载，必须走 HTTP。
//      手机与电脑需在同一局域网（脚本会打印局域网地址）。
//
// 零依赖，只用 Node 内置模块。

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { networkInterfaces } from 'node:os'

const ROOT = resolve(import.meta.dirname, '..')
const PORT = Number(process.argv[2] || 8000)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (pathname.endsWith('/')) pathname += 'index.html'

    const file = normalize(join(ROOT, pathname))
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden')
      return
    }

    const info = await stat(file)
    if (info.isDirectory()) {
      res.writeHead(302, { Location: pathname + '/' }).end()
      return
    }

    const body = await readFile(file)
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',   // 开发期禁用缓存，避免改了看不到
    }).end(body)
  } catch (err) {
    const code = err && err.code === 'ENOENT' ? 404 : 500
    res.writeHead(code).end(code === 404 ? 'not found' : String(err && err.message || err))
  }
})

server.listen(PORT, '0.0.0.0', () => {
  const ips = []
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address)
    }
  }
  // 排序：真正的局域网段优先；Tailscale CGNAT(100.64/10) 与虚拟网卡靠后。
  // 手机与电脑在同一 WiFi 时，能访问的是 192.168.x.x 这类地址，不是 Tailscale IP。
  const rank = ip =>
    /^192\.168\./.test(ip) ? 0
    : /^10\./.test(ip) ? 1
    : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2
    : /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) ? 4
    : 3
  ips.sort((a, b) => rank(a) - rank(b))
  console.log('')
  console.log('  静态预览服务已启动（根目录: ' + ROOT + '）')
  console.log('')
  console.log('  本机   http://localhost:' + PORT + '/')
  for (const ip of ips) console.log('  手机   http://' + ip + ':' + PORT + '/')
  console.log('')
  if (ips.length) console.log('  探针   http://' + ips[0] + ':' + PORT + '/probe.html')
  console.log('')
  console.log('  Ctrl+C 停止')
  console.log('')
})
