var RpcClient = require('bitcoind-rpc')
var Promise = require('bluebird')
var ReadyMixin = require('ready-mixin')(Promise)

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

module.exports = Bitcoind
