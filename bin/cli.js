#!/usr/bin/env node
var yargs = require('yargs')
var fs = require('fs')
var Yaml = require('js-yaml')
var Promise = require('bluebird')
var ProgressBar = require('progress')

var Bitcoind = require('../lib/bitcoind')
var ColorData = require('../lib/colordata')
var ScanData = require('../lib/scandata')

var argv = yargs
  .usage('Usage: $0 [-h] [-c CONFIG]')
  .option('c', {
    alias: 'config',
    demand: true,
    default: 'config/default.yml',
    describe: 'configuration file',
    type: 'string'
  })
  .help('h')
  .alias('h', 'help')
  .version(function () { return require('../package.json').version })
  .argv

Promise.onPossiblyUnhandledRejection(function (err) {
  console.error(err.stack || err)
  process.exit(1)
})

var config = Yaml.safeLoad(fs.readFileSync(argv.config, 'utf-8'))
var bitcoind = new Bitcoind(config.bitcoind)
var colordata = new ColorData({filename: config.sqlite.filename})
var scandata = new ScanData(colordata, {filename: config.sqlite.filename})
var bar = new ProgressBar('Scan progress: :persent, blocks: :current / :total, tx: :currentTx / :totalTx', {
  total: 0
})

/**
 * @return {Promise}
 */
function mainLoop () {
}

Promise.all([bitcoind.ready, colordata.ready, scandata.ready])
.then(function () {
  console.log('database opened')
  mainLoop()
})
