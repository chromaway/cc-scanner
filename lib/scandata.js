var Promise = require('bluebird')
var ReadyMixin = require('ready-mixin')(Promise)
var cclib = require('coloredcoinjs-lib')

var cdefClss = cclib.definitions.Manager.getColorDefinitionClasses()

var SQL = {
  create: {
    table: 'CREATE TABLE IF NOT EXISTS scan_data ( ' +
           '  height INTEGER NOT NULL, ' +
           '  blockhash TEXT NOT NULL, ' +
           '  txid TEXT NOT NULL)',
    indices: {
      pk: 'CREATE UNIQUE INDEX IF NOT EXISTS scan_data_idx_pk ' +
          '  ON scan_data (blockhash, txid)',
      height: 'CREATE INDEX IF NOT EXISTS scan_data_idx_height ' +
              '  ON scan_data (height)'
    }
  },
  insert: {
    row: 'INSERT INTO scan_data (height, blockhash, txid) VALUES ($1, $2, $3)'
  },
  select: {
    lastHeight: 'SELECT height, blockhash FROM scan_data ' +
                '  ORDER BY height DESC ' +
                '  LIMIT 1'
  }
}

/**
 * @class ScanData
 * @mixes ReadyMixin
 * @param {Object} config
 */
function ScanData (config) {
  var self = this

  self._getTxFn = function (txid, callback) {
    config.bitcoind.getTx(txid)
      .asCallback(callback)
      .done(function () {}, function () {})
  }

  self._updateProgress = config.updateProgress

  self._cdefstorage = new cclib.storage.definitions.SQLite(config)
  self._cdmanager = new cclib.definitions.Manager(self._cdefstorage)

  self._cdstorage = new cclib.storage.data.SQLite(config)
  self._cdata = new cclib.ColorData(self._cdstorage, self._cdmanager)

  self._provider = new cclib.storage.providers.SQLite(config.filename)

  var providerReady = self._provider.open()
    .then(function () {
      return self._provider.transaction(function (tx) {
        return tx.execute(SQL.create.table)
          .then(function () {
            return Promise.all([
              tx.execute(SQL.create.indices.pk),
              tx.execute(SQL.create.indices.height)
            ])
          })
      })
    })

  Promise.all([self._cdefstorage.ready, self._cdstorage.ready, providerReady])
    .done(function () { self._ready() },
          function (err) { self._ready(err) })
}

ReadyMixin(ScanData.prototype)

/**
 * @return {Promise.<{height: number, hash: string}>}
 */
ScanData.prototype.getLastHeight = function () {
  var self = this
  return self._provider.transaction(function (tx) {
    return tx.execute(SQL.select.lastHeight)
  })
  .then(function (data) {
    if (data.length > 0) {
      return {height: data[0].height, hash: data[0].hash}
    }

    return {height: -1}
  })
}

/**
 * @param {number} height
 * @return {Promise}
 */
ScanData.prototype.undoTo = function (height) {}

/**
 * @param {bitcore.Block} block
 * @param {number} height
 * @return {Promise}
 */
ScanData.prototype.scanBlock = function (block, height) {
  var self = this

  self._updateProgress({tTotal: block.transactions.length})

  var blockhash = block.hash
  return Promise.map(block.transactions, function (tx, index) {
    return Promise.map(cdefClss, function (cdefCls) {
      return self._cdata.fullScanTx(tx, cdefCls, self._getTxFn)
    }, {concurrency: 1})
    .then(function () {
      return self._provider.transaction(function (stx) {
        return stx.execute(SQL.insert.row, [height, blockhash, tx.id])
      })
    })
    .then(function () {
      self._updateProgress({tCurr: index + 1})
    })
  }, {concurrency: 1})
}

module.exports = ScanData
