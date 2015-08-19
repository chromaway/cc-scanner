import RpcClient from 'bitcoind-rpc'
import initReadyPromise from 'ready-mixin'

import { promisify } from './util'

/**
 * @class Bitcoind
 * @mixes ReadyMixin
 */
export default class Bitcoind {
  /**
   * @constructor
   * @param {Object} config Params for connecting to bitcoind
   */
  constructor (config) {
    Promise.resolve()
      .then(async () => {
        this._bitcoind = new RpcClient(config)
        this._getBlockCount = promisify(::this._bitcoind.getBlockCount)
        this._getBlockHash = promisify(::this._bitcoind.getBlockHash)
        this._getBlock = promisify(::this._bitcoind.getBlock)
        this._getRawTransaction = promisify(::this._bitcoind.getRawTransaction)

        let info = await promisify(::this._bitcoind.getInfo)()
        console.log('Connected to bitcoind! version: ' + info.result.version)
      })
      .then(() => { this._ready() }, (err) => { this._ready(err) })
  }

  /**
   * @return {Promise.<{height: number, hash: string>}
   */
  async getLatest () {
    await this.ready

    let latest = {}

    let ret = await this._getBlockCount()
    latest.height = ret.result

    ret = await this._getBlockHash(latest.height)
    latest.hash = ret.result

    return latest
  }

  /**
   * @param {string} height
   * @return {Promise.<bitcore.Block>}
   */
  async getBlock (height) {
    await this.ready

    let ret = await this._getBlockHash(height)
    ret = await this._getBlock(ret.result, false)
    return ret.result
  }

  /**
   * @param {string} txId
   * @return {Promise.<string>}
   */
  async getTx (txId) {
    await this.ready

    let ret = await this._getRawTransaction(txId)
    return ret.result
  }
}

let ReadyMixin = initReadyPromise(Promise)
ReadyMixin(Bitcoind.prototype)
