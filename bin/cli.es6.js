import 'source-map-support/register'

import _ from 'lodash'
import yargs from 'yargs'
import fs from 'fs'
import Yaml from 'js-yaml'
import ProgressBar from 'progress'
import bitcore from 'bitcore'

import Bitcoind from '../lib/bitcoind'
import ScanData from '../lib/scandata'
import { startServer } from '../lib/service'

let argv = yargs
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
  .version(() => { return require('../package.json').version })
  .argv

let bar = new ProgressBar(
  'blocks: :bCurr / :bTotal, transactions for current block: :tCurr / :tTotal',
  {total: Infinity})
let barTokens = {bCurr: 0, bTotal: 0, tCurr: 0, tTotal: 0}
let updateProgress = (tokens) => {
  barTokens = _.extend(barTokens, tokens)
  bar.tick(barTokens)
}

let config = Yaml.safeLoad(fs.readFileSync(argv.config, 'utf-8'))
let bitcoind = new Bitcoind(config.bitcoind)
let scandata = new ScanData({
  bitcoind: bitcoind,
  db: config.postgresql,
  updateProgress: updateProgress
})

Promise.resolve()
  .then(async () => {
    await* [bitcoind.ready, scandata.ready]
    console.log('database opened')

    let latest = await scandata.getLatest()
    if (latest.height > 0) {
      await scandata.undoTo(latest.height)
    }

    if (config.service) {
      await startServer({
        scandata: scandata,
        port: config.service.port || 4445
      })
    }

    while (true) {
      let [latestBitcoind, latestDB] = await* [
        bitcoind.getLatest(),
        scandata.getLatest()
      ]

      if (latestBitcoind.hash === latestDB.hash) {
        await new Promise((resolve) => { setTimeout(resolve, 1000) })
        continue
      }

      updateProgress({bCurr: latestDB.height, bTotal: latestBitcoind.height})

      if (latestDB.height >= latestBitcoind.height) {
        await scandata.undoTo(latestBitcoind.height)
        continue
      }

      let height = latestDB.height + 1
      let rawBlock = await bitcoind.getBlock(height)
      let block = bitcore.Block.fromString(rawBlock)
      await scandata.scanBlock(block, height)
    }
  })
  .catch((err) => {
    console.error(err.stack)
    process.exit(1)
  })
