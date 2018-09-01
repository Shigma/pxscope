const pj = require('../package.json')
const ep = require('electron-packager')
const archiver = require('archiver')
const cp = require('child_process')
const util = require('./util')
const path = require('path')
const fs = require('fs')

const DIR_PATH = util.resolve(`pack/PxScope-v${pj.version}-win32-x64`)
const ERROR_CODE = util.flag('slient') ? 0 : 1

if (process.env.TRAVIS === 'true') {
  try {
    console.log('\nDownloading and installing wine ...\n')
    cp.execFileSync(util.resolve('build/wine.sh'), { stdio: 'inherit' })
  } catch (error) {
    process.exit(ERROR_CODE)
  }
}

function hook(callback) {
  return [(tempdir, version, platform, arch, next) => {
    callback(tempdir)
    next()
  }]
}

util.start()
util.clone('main.prod.js', 'main.js')

if (fs.existsSync(DIR_PATH)) {
  console.log('Directory already exists and will be removed first.\n')
  util.remove(DIR_PATH)
  util.remove(DIR_PATH + '.zip')
}

ep({
  appVersion: pj.version,
  platform: 'win32',
  arch: 'x64',
  icon: util.resolve('assets/logo.icon'),
  dir: util.resolve(),
  executableName: 'PxScope',
  ignore: [
    /.+\.dev\..+/,
    /.+\.js\.map/,
    /.+\.d\.ts'/,
    /test\..+/,
    '.vscode',
    '.eslintignore',
    '.eslintrc.yml',
    '.gitattributes',
    '.gitignore',
    '.gitmodules',
    'tslint.yml',
    'tsconfig.json',
    '/package-lock.json',
    '/assets/icons.svg',
    '/assets/logo.ico',
    '/assets/logo.svg',
    '/pixiv/src',
    '/build',
    '/comp',
    '/docs',
  ],
  name: `PxScope-v${pj.version}`,
  out: path.join(__dirname, '../pack'),
  prune: true,
  afterCopy: hook(tempdir => console.log(`All files have been copied to ${tempdir}.`)),
  afterExtract: hook(tempdir => console.log(`Electron has been extracted to ${tempdir}.`)),
  afterPrune: hook(() => {
    // FIXME: prune node modules.
    console.log(`Prune Succeed. Waiting for files to copied into ${DIR_PATH} ...`)
  }),
}).then((_, error) => {
  util.clone('main.dev.js', 'main.js')

  if (error) throw error
  console.log(`Pack Succeed. ${util.time()} Total size: ${util.getSize(DIR_PATH) >> 20} MB.`)

  if (!util.flag('dir')) {
    console.log('\nWaiting for files to be compressed ...')
    const stream = fs.createWriteStream(DIR_PATH + '.zip')
    const archive = archiver('zip', { zlib: { level: util.flag('min') ? 9 : 0 } })

    stream.on('close', () => {
      console.log(`Compress Succeed. ${util.time()} Total size: ${archive.pointer() >> 20} MB.`)
      process.exit(0)
    })

    archive.on('warning', error => console.error(error))
    archive.on('error', error => { throw error })

    archive.pipe(stream)
    archive.directory(DIR_PATH)
    archive.finalize()
  }
}).catch((error) => {
  console.error(error)
  process.exit(ERROR_CODE)
})  
