process.env.NODE_ENV = 'production'

const chalk = require('chalk')
const del = require('del')
const webpack = require('webpack')
const Spinnies = require('spinnies')

const mainConfig = './main/webpack.config.prod'
const rendererConfig = './renderer/webpack.config.prod'
const rendererLyricConfig = './renderer-lyric/webpack.config.prod'
const rendererScriptConfig = './renderer-scripts/webpack.config.prod'

const errorLog = chalk.bgRed.white(' ERROR ') + ' '
const okayLog = chalk.bgGreen.white(' OKAY ') + ' '

const { Worker, isMainThread, parentPort } = require('worker_threads')


function build() {
  console.time('build')
  del.sync(['dist/**', 'build/**'])

  const spinners = new Spinnies({ color: 'blue' })
  spinners.add('main', { text: 'main building' })
  spinners.add('renderer', { text: 'renderer building' })
  spinners.add('renderer-lyric', { text: 'renderer-lyric building' })
  spinners.add('renderer-scripts', { text: 'renderer-scripts building' })
  let results = ''

  // m.on('success', () => {
  //   process.stdout.write('\x1B[2J\x1B[0f')
  //   console.log(`\n\n${results}`)
  //   console.log(`${okayLog}take it away ${chalk.yellow('`electron-builder`')}\n`)
  //   process.exit()
  // })
  function handleSuccess() {
    process.stdout.write('\x1B[2J\x1B[0f')
    console.log(`\n\n${results}`)
    console.log(`${okayLog}take it away ${chalk.yellow('`electron-builder`')}\n`)
    console.timeEnd('build')
    process.exit()
  }

  // Folia 加入后 renderer 体积暴涨，四套 webpack + Terser 多 worker 并行时
  // macOS runner（7GB）会打出 ERR_WORKER_OUT_OF_MEMORY（见 CI #79 / #80）。
  // CI 上用 OVERTONE_BUILD_SERIAL=1 改为串行，内存峰值降到约 1/4；本地仍默认并行。
  const targets = [
    { key: 'main', config: mainConfig, label: 'main process' },
    { key: 'renderer', config: rendererConfig, label: 'renderer process' },
    { key: 'renderer-lyric', config: rendererLyricConfig, label: 'renderer-lyric process' },
    { key: 'renderer-scripts', config: rendererScriptConfig, label: 'renderer-scripts process' },
  ]
  const runOne = ({ key, config, label }) => pack(config).then(result => {
    results += `${result}\n\n`
    spinners.succeed(key, { text: `${key} build success!` })
  }).catch(err => {
    spinners.fail(key, { text: `${key} build fail :(` })
    console.log(`\n  ${errorLog}failed to build ${label}`)
    console.error(`\n${err}\n`)
    process.exit(1)
  })

  if (process.env.OVERTONE_BUILD_SERIAL === '1') {
    console.log('[pack] 串行构建（OVERTONE_BUILD_SERIAL=1），降低内存峰值')
    void (async() => {
      for (const target of targets) await runOne(target)
      handleSuccess()
    })()
  } else {
    Promise.all(targets.map(runOne)).then(handleSuccess)
  }
}

function pack(config) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename)
    const subChannel = new MessageChannel()
    worker.postMessage({ port: subChannel.port1, config }, [subChannel.port1])
    subChannel.port2.on('message', ({ status, message }) => {
      switch (status) {
        case 'success': return resolve(message)
        case 'error': return reject(message)
      }
    })
  })
}

function runPack(config) {
  return new Promise((resolve, reject) => {
    config = require(config)
    config.mode = 'production'
    webpack(config, (err, stats) => {
      if (err) reject(err.stack || err)
      else if (stats.hasErrors()) {
        let err = ''

        stats.toString({
          chunks: false,
          modules: false,
          colors: true,
        })
          .split(/\r?\n/)
          .forEach(line => {
            err += `    ${line}\n`
          })

        reject(err)
      } else {
        resolve(stats.toString({
          chunks: false,
          colors: true,
        }))
      }
    })
  })
}

if (isMainThread) {
  // 每次构建都把 package.json 版本同步到 publish/version.json，
  // 避免「软件已是新版、检查更新却显示旧版」这种双版本源不同步。
  require('./sync-version-info.cjs')()
  build()
}
else {
  parentPort.once('message', ({ port, config }) => {
    // assert(port instanceof MessagePort)
    runPack(config).then((result) => {
      port.postMessage({
        status: 'success',
        message: result,
      })
    }).catch((err) => {
      port.postMessage({
        status: 'error',
        message: err,
      })
    }).finally(() => {
      port.close()
    })
  })
}
