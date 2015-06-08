var Promise = require('bluebird')
var ReadyMixin = require('ready-mixin')(Promise)
var cclib = require('coloredcoinjs-lib')

var SQL = {
  create: {
    table: 'CREATE TABLE IF NOT EXISTS scan_data ( ' +
           '  height INTEGER NOT NULL, ' +
           '  blockhash TEXT NOT NULL, ' +
           '  txid TEXT NOT NULL)',
    indices: {
      height: 'CREATE INDEX IF NOT EXISTS scan_data_idx_height ' +
              '  ON scan_data (height)'
    }
  }
}

/**
 * @class ScanData
 * @mixes ReadyMixin
 * @param {coloredcoinjs-lib.ColorData} colordata
 * @param {Object} config
 */
function ScanData (colordata, config) {
  var self = this
  self._colordata = colordata

  self._provider = new cclib.storage.providers.SQLite(config.filename)
  self._provider.open()
    .then(function () {
      return self._provider.transaction(function (tx) {
        return tx.execute(SQL.create.table)
          .then(function () {
            return tx.execute(SQL.create.indices.height)
          })
      })
    })
    .done(function () { self._ready() },
          function (err) { self._ready(err) })
}

ReadyMixin(ScanData.prototype)

module.exports = ScanData
