// 无界面逻辑冒烟测试：用 esbuild API 打包后在 Node 中运行 store-smoke.ts
const os = require('os')
const fs = require('fs')
const path = require('path')
const esbuild = require('esbuild')

const outfile = path.join(os.tmpdir(), `etymology-smoke-${process.pid}.mjs`)

esbuild.build({
  entryPoints: [path.join(__dirname, 'store-smoke.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'warning',
})
  .then(() => import(outfile))
  .then(() => fs.promises.rm(outfile, { force: true }))
  .catch((err) => {
    console.error(err)
    try { fs.rmSync(outfile, { force: true }) } catch { /* ignore */ }
    process.exit(1)
  })
