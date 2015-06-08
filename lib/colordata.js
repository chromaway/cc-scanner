var cclib = require('coloredcoinjs-lib')
var Promise = require('bluebird')
var ReadyMixin = require('ready-mixin')(Promise)

/**
 * @class ColorData
 * @mixes ReadyMixin
 * @param {Object} config
 * @param {string} config.filename
 */
function ColorData (config) {
  var self = this

  self._cdefstorage = new cclib.storage.definitions.SQLite(config)
  self._cdmanager = new cclib.definitions.Manager(self._cdefstorage)

  self._cdstorage = new cclib.storage.data.SQLite(config)
  self._cdata = new cclib.ColorData(self._cdstorage, self._cdmanager)

  Promise.all([self._cdefstorage.ready, self._cdstorage.ready])
    .done(function () { self._ready() },
          function (err) { self._ready(err) })
}

ReadyMixin(ColorData.prototype)

module.exports = ColorData
