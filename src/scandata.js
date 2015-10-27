import _ from 'lodash'
import { PostgreSQL as PostgreSQLStorage } from 'odd-storage'
import { mixin } from 'core-decorators'
import ReadyMixin from 'ready-mixin'
import cclib from 'coloredcoinjs-lib'
import bitcore from 'bitcore-lib'

let Transaction = bitcore.Transaction
let cdefClss = cclib.definitions.Manager.getColorDefinitionClasses()

let SQL = {
  create: {
    table: 'CREATE TABLE IF NOT EXISTS scan_data ( ' +
           '  height INTEGER NOT NULL, ' +
           '  blockhash TEXT NOT NULL, ' +
           '  txid TEXT NOT NULL, ' +
           '  PRIMARY KEY (blockhash, txid));',
    indices: {
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
    blockTxIds: 'SELECT txid FROM scan_data WHERE height = $1',
    allCoins: 'SELECT txid, oidx, value FROM cclib_data_values ' +
              'INNER JOIN cclib_data_tx ON tx_pk = pk ' +
              'WHERE color_id = $1'
  },
  remove: {
    rows: 'DELETE FROM scan_data WHERE height = $1'
  }
}

/**
 * @class ScanData
 * @mixes ReadyMixin
 */
@mixin(ReadyMixin)
export default class ScanData {
  /**
   * @constructor
   * @param {Object} config
   */
  constructor (config) {
    Promise.resolve()
      .then(async () => {
        this._getTxFn = (txId, cb) => {
          this._bitcoind.getTx(txId)
            .then((rawtx) => { cb(null, rawtx) }, (err) => { cb(err) })
        }

        this._bitcoind = config.bitcoind
        this._updateProgress = config.updateProgress

        this._cdefstorage = new cclib.storage.definitions.PostgreSQL(config.db)
        this._cdmanager = new cclib.definitions.Manager(this._cdefstorage)

        this._cdstorage = new cclib.storage.data.PostgreSQL(config.db)
        this._cdata = new cclib.ColorData(this._cdstorage, this._cdmanager)

        this._storage = new PostgreSQLStorage(config.db)

        await this._storage.open()
        await this._storage.executeSQL(SQL.create.table)
        await this._storage.executeSQL(SQL.create.indices.height)

        await* [this._cdefstorage.ready, this._cdstorage.ready]
      })
      .then(() => { this._ready() }, (err) => { this._ready(err) })
  }

  /**
   * @return {Promise.<{height: number, hash: string}>}
   */
  async getLatest () {
    let data = await this._storage.executeSQL(SQL.select.lastHeight)
    if (data.length > 0) {
      return {height: data[0].height, hash: data[0].blockhash}
    }

    return {height: -1}
  }

  /**
   * @param {number} height
   * @return {Promise}
   */
  async undoTo (toHeight) {
    console.log('Undo to ' + (toHeight - 1))

    let latest = await this.getLatest()
    let currHeight = latest.height
    for (; currHeight >= toHeight; currHeight -= 1) {
      let rows = await this._storage.executeSQL(
        SQL.select.blockTxIds, [currHeight])
      if (rows.length === 0) {
        continue
      }

      await* _.pluck(rows, 'txid').map(async (txId) => {
        await* cdefClss.map((cdefCls) => {
          return this._cdata.removeColorValues(txId, cdefCls)
        })
      })

      await this._storage.executeSQL(SQL.remove.rows, [currHeight])
    }
  }

  /**
   * @param {string} txId
   * @param {number[]} outIndices
   * @param {string} colorCode
   * @return {Promise.<Array.<{cdef: IColorDefinition, outputs: ColorValue[]}>>}
   */
  async getTxColorValues (txId, outIndices, colorCode) {
    let rawtx = await this._bitcoind.getTx(txId)
    let tx = new Transaction(rawtx)
    let cdefCls = cclib.definitions.Manager.getColorDefinitionClass(colorCode)
    return await this._cdata.getTxColorValues(
      tx, outIndices, cdefCls, this._getTxFn)
  }

  /**
   * @param {string} colorDesc
   * @return {Promise.<{txId: string, outIndex: number, colorValue: *}[]>}
   */
  async getAllColoredCoins (colorDesc) {
    let cdef = await this._cdmanager.resolve(colorDesc, {autoAdd: false})
    if (cdef === null) {
      throw new Error(`color not known: ${colorDesc}`)
    }

    let colorId = cdef.getColorId()
    let rows = await this._storage.executeSQL(SQL.select.allCoins, [colorId])
    return rows.map((row) => {
      return {
        txId: row.txid,
        outIndex: row.oidx,
        colorValue: JSON.parse(row.value)
      }
    })
  }

  /**
   * @param {bitcore.Block} block
   * @param {number} height
   * @return {Promise}
   */
  async scanBlock (block, height) {
    this._updateProgress({tTotal: block.transactions.length})

    let blockhash = block.hash
    let tCurr = 0

    for (let tx of block.transactions) {
      for (let cdefCls of cdefClss) {
        await this._cdata.fullScanTx(tx, cdefCls, this._getTxFn)
      }

      let args = [height, blockhash, tx.id]
      await this._storage.executeSQL(SQL.insert.row, args)
      this._updateProgress({tCurr: tCurr++})
    }
  }
}
