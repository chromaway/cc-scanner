'use strict'

var RpcClient = require('bitcoind-rpc')
var Promise = require('bluebird')
var ReadyMixin = require('ready-mixin')(Promise)
var bitcore = require('bitcore')

/**
 * @class Bitcoind
 * @mixes ReadyMixin
 * @param {Object} config Params for connecting to bitcoind
 */
function Bitcoind (config) {
  var self = this
  Promise.try(function () {
    self._bitcoind = Promise.promisifyAll(new RpcClient(config))
    return self._bitcoind.getInfoAsync()
  })
  .then(function (ret) {
    console.log('Connected to bitcoind! version: ' + ret.result.version)
  })
  .done(function () { self._ready() },
        function (err) { self._ready(err) })
}

ReadyMixin(Bitcoind.prototype)

/**
 * @return {Promise.<{height: number, hash: string>}
 */
Bitcoind.prototype.getLatest = function () {
  var self = this
  return self.ready
    .then(function () {
      var latest = {}
      return self._bitcoind.getBlockCountAsync()
        .then(function (ret) {
          latest.height = ret.result
          return self._bitcoind.getBlockHashAsync(latest.height)
        })
        .then(function (ret) {
          latest.hash = ret.result
          return latest
        })
    })
}

/**
 * @param {string} height
 * @return {Promise.<bitcore.Block>}
 */
Bitcoind.prototype.getBlock = function (height) {
  var self = this
  return self.ready
    .then(function () {
      return self._bitcoind.getBlockHashAsync(height)
    })
    .then(function (ret) {
      return self._bitcoind.getBlockAsync(ret.result, false)
    })
    .then(function (ret) {
      return bitcore.Block(new Buffer(ret.result, 'hex'))
    })
}

/**
 * @param {string} txid
 * @return {Promise.<string>}
 */
Bitcoind.prototype.getTx = function (txid) {
  var self = this
  return self.ready
    .then(function () {
      return self._bitcoind.getRawTransactionAsync(txid)
    })
    .then(function (ret) {
      return ret.result
    })
}

module.exports = Bitcoind
