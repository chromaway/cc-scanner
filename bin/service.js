var express = require('express');
var jsonBody = require('body/json');
var sendJson = require('send-data/json');
var cors = require('cors');
var logger = require('morgan');
var Promise = require('bluebird')

var app = express();

var cors_options = {origin: true, credentials: true};
app.use(logger());
app.use(cors(cors_options));
app.options('*', cors(cors_options));

var api = express.Router();


var scandata = null;

function defineAPIcall(name, computeFn, formatFn) {
  api.post(name, function (req, res) {
    jsonBody(req, function (error, body) {
      if (error) res.status(400).json({error: 'JSON required'})
      else {
        computeFn(body).done(
          function (result) { res.json(formatFn(result))},
          function (err) { 
            console.error(err.stack || err)
            res.status(500).json({error: err.toString()}) 
          }
        );
      }
    })
  })
  api.get(name, function (req, res) {
    computeFn(req.query).done(
      function (result) { res.json(formatFn(result))},
      function (err) { 
        console.error(err.stack || err)
          res.status(500).json({error: err.toString()}) 
        }
      )
  })
}



defineAPIcall('/getTxColorValues', function (request) {
  return scandata.getTxColorValues(request.txid, request.outputs || null,
                                   request.color_kernel || 'epobc')
    .then(function (result) {
      if (result.outputs && result.outputs.length > 0) {
        var outputColorValues = result.outputs[0].outputs
        if (result.outputs.length > 1) { // handle multiple colors
          result.outputs.forEach(function (cvs, idx) {
            if (idx > 0) {
              cvs.outputs.forEach(function (cv, oidx) {
                if (cv !== null) {
                  if (outputColorValues[oidx] !== null) {
                    throw new Error("Two colorvalues for one output, " + cv.toString() 
                                    + " and " + outputColorValues[oidx].toString())
                  }
                  outputColorValues[oidx] = cv
                }
              })
            }
          })
        }
        return outputColorValues.map(function (cv) {
          if (cv !== null) {
            return {
              color: cv.getColorDefinition().getDesc(),
              value: cv.getValue()
            }
          } else return null;
        })
      } else return null;
    })
}, function (result) {
  return {
    colorvalues: result
  }
})


app.use('/api', api);

exports.startServer = function (opts) {
  scandata = opts.scandata;
  return new Promise(function (resolve, reject) {
      var server = app.listen(opts.port, function (err) {
        if (err) reject(err);
        else {
          console.log('Listening on port %d', server.address().port);
          resolve(server)
        }
      })
  })
};
