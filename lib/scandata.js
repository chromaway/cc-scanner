var _ = require('lodash')
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
      pk: 'DO $$ ' +
          'BEGIN ' +
          '  IF NOT EXISTS ( ' +
          '    SELECT 1 ' +
          '      FROM pg_class c ' +
          '      JOIN pg_namespace n ' +
          '      ON n.oid = c.relnamespace ' +
          '      WHERE c.relname = \'color_data_tx_idx\' ' +
          '      AND n.nspname = \'public\' ' +
          '  ) THEN ' +
          '  CREATE INDEX color_data_tx_idx ON scan_data (blockhash, txid); ' +
          'END IF; ' +
          'END$$;',
      height: 'DO $$ ' +
              'BEGIN ' +
              '  IF NOT EXISTS ( ' +
              '    SELECT 1 ' +
              '      FROM pg_class c ' +
              '      JOIN pg_namespace n ' +
              '      ON n.oid = c.relnamespace ' +
              '      WHERE c.relname = \'scan_data_idx_height\' ' +
              '      AND n.nspname = \'public\' ' +
              '  ) THEN ' +
              '  CREATE INDEX scan_data_idx_height ON scan_data (height); ' +
              'END IF; ' +
              'END$$;'
    }
  },
  insert: {
    row: 'INSERT INTO scan_data (height, blockhash, txid) VALUES ($1, $2, $3)'
  },
  select: {
    lastHeight: 'SELECT height, blockhash FROM scan_data ' +
                '  ORDER BY height DESC ' +
                '  LIMIT 1',
    blockTxIds: 'SELECT txid FROM scan_data WHERE height = $1'
  },
  remove: {
    rows: 'DELETE FROM scan_data WHERE height = $1'
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

  self._cdefstorage = new cclib.storage.definitions.PostgreSQL(config.db)
  self._cdmanager = new cclib.definitions.Manager(self._cdefstorage)

  self._cdstorage = new cclib.storage.data.PostgreSQL(config.db)
  self._cdata = new cclib.ColorData(self._cdstorage, self._cdmanager)

  self._storage = new cclib.storage.providers.PostgreSQL(config.db)

  var storageReady = self._storage.open()
    .then(function () {
      return self._storage.transaction(function () {
        return self._storage.executeSQL(SQL.create.table)
          .then(function () {
            return Promise.all([
              self._storage.executeSQL(SQL.create.indices.pk),
              self._storage.executeSQL(SQL.create.indices.height)
            ])
          })
      })
    })

  Promise.all([self._cdefstorage.ready, self._cdstorage.ready, storageReady])
    .done(function () { self._ready() },
          function (err) { self._ready(err) })
}

ReadyMixin(ScanData.prototype)

/**
 * @return {Promise.<{height: number, hash: string}>}
 */
ScanData.prototype.getLatest = function () {
  var self = this
  return self._storage.transaction(function () {
    return self._storage.executeSQL(SQL.select.lastHeight)
  })
  .then(function (data) {
    if (data.length > 0) {
      return {height: data[0].height, hash: data[0].blockhash}
    }

    return {height: -1}
  })
}

/**
 * @param {number} height
 * @return {Promise}
 */
ScanData.prototype.undoTo = function (toHeight) {
  console.log('Undo to ' + (toHeight - 1))

  var self = this
  return self.getLatest()
    .then(function (latest) {
      var currHeight = latest.height
      return new Promise(function (resolve, reject) {
        function undo () {
          if (currHeight < toHeight) {
            return resolve()
          }

          return self._storage.transaction(function () {
            return self._storage.executeSQL(SQL.select.blockTxIds, [currHeight])
          })
          .then(function (rows) {
            if (rows.length === 0) {
              return
            }

            var txids = _.pluck(rows, 'txid')
            return Promise.map(txids, function (txid) {
              return Promise.map(cdefClss, function (cdefCls) {
                return self._cdata.removeColorValues(txid, cdefCls)
              })
            })
            .then(function () {
              return self._storage.transaction(function () {
                return self._storage.executeSQL(SQL.remove.rows, [currHeight])
              })
            })
          })
          .then(function () { currHeight -= 1 })
          .done(undo, reject)
        }

        undo()
      })
    })
}

/**
 * @param {bitcore.Block} block
 * @param {number} height
 * @return {Promise}
 */
ScanData.prototype.scanBlock = function (block, height) {
  var self = this

  self._updateProgress({tTotal: block.transactions.length})

  var blockhash = block.hash
  var tCurr = 0

  return Promise.map(block.transactions, function (tx) {
    return Promise.map(cdefClss, function (cdefCls) {
      return self._cdata.fullScanTx(tx, cdefCls, self._getTxFn)
    }, {concurrency: 1})
    .then(function () {
      return self._storage.transaction(function () {
        var args = [height, blockhash, tx.id]
        return self._storage.executeSQL(SQL.insert.row, args)
      })
    })
    .then(function () {
      self._updateProgress({tCurr: tCurr++})
    })
  }, {concurrency: 1})
}

module.exports = ScanData
