#!/usr/bin/env node
var _ = require('lodash')
var yargs = require('yargs')
var fs = require('fs')
var Yaml = require('js-yaml')
var Promise = require('bluebird')
var ProgressBar = require('progress')

var Bitcoind = require('../lib/bitcoind')
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

var bar = new ProgressBar(
  'blocks: :bCurr / :bTotal, transactions for current block: :tCurr / :tTotal', {total: Infinity})
var barTokens = {bCurr: 0, bTotal: 0, tCurr: 0, tTotal: 0}

function updateProgress (tokens) {
  barTokens = _.extend(barTokens, tokens)
  bar.tick(barTokens)
}

var config = Yaml.safeLoad(fs.readFileSync(argv.config, 'utf-8'))
var bitcoind = new Bitcoind(config.bitcoind)
var scandata = new ScanData({
  bitcoind: bitcoind,
  db: config.postgresql,
  updateProgress: updateProgress
})

/**
 * @return {Promise}
 */
function mainLoop () {
  Promise.all([
    bitcoind.getLatest(),
    scandata.getLatest()
  ])
  .spread(function (latestBitcoind, latestDB) {
    if (latestDB.hash === latestBitcoind.hash) {
      return Promise.delay(1000)
    }

    updateProgress({bCurr: latestDB.height, bTotal: latestBitcoind.height})

    if (latestDB.height >= latestBitcoind.height) {
      return scandata.undoTo(latestBitcoind.height)
    }

    var height = latestDB.height + 1
    return bitcoind.getBlock(height)
      .then(function (block) {
        return scandata.scanBlock(block, height)
      })
  })
  .then(mainLoop)
}

Promise.all([bitcoind.ready, scandata.ready])
.then(function () {
  console.log('database opened')

  scandata.getLatest()
    .then(function (latest) {
      if (latest.height > 0) {
        return scandata.undoTo(latest.height)
      }
    })
    .then(mainLoop)
})
