import RpcClient from 'bitcoind-rpc-client'
import initReadyPromise from 'ready-mixin'

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

        let info = await this._bitcoind.getInfo()
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

    let ret = await this._bitcoind.getBlockCount()
    latest.height = ret.result

    ret = await this._bitcoind.getBlockHash(latest.height)
    latest.hash = ret.result

    return latest
  }

  /**
   * @param {string} height
   * @return {Promise.<bitcore.Block>}
   */
  async getBlock (height) {
    await this.ready

    let ret = await this._bitcoind.getBlockHash(height)
    ret = await this._bitcoind.getBlock(ret.result, false)
    return ret.result
  }

  /**
   * @param {string} txId
   * @return {Promise.<string>}
   */
  async getTx (txId) {
    await this.ready

    let ret = await this._bitcoind.getRawTransaction(txId)
    return ret.result
  }
}

let ReadyMixin = initReadyPromise(Promise)
ReadyMixin(Bitcoind.prototype)
