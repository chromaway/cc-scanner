import express from 'express'
import jsonBody from 'body/json'
import cors from 'cors'
import logger from 'morgan'

let app = express()

let cors_options = {origin: true, credentials: true}
app.use(logger('combined'))
app.use(cors(cors_options))
app.options('*', cors(cors_options))

let api = express.Router()

let scandata = null

function defineAPIcall (name, computeFn, formatFn) {
  api.post(name, (req, res) => {
    jsonBody(req, async (err, body) => {
      if (err) {
        return res.status(400).json({error: 'JSON required'})
      }

      try {
        let result = await computeFn(body)
        res.json(formatFn(result))
      } catch (err) {
        console.error(err.stack || err)
        res.status(500).json({error: err.toString()})
      }
    })
  })

  api.get(name, async (req, res) => {
    try {
      let result = await computeFn(req.query)
      res.json(formatFn(result))
    } catch (err) {
      console.error(err.stack || err)
      res.status(500).json({error: err.toString()})
    }
  })
}

defineAPIcall('/getAllColoredCoins', (request) => {
  return scandata.getAllColoredCoins(request.color)
}, (coins) => { return {coins: coins} })

defineAPIcall('/getTxColorValues', async (request) => {
  let outIndices = request.outIndices
  if (!outIndices && request.outIndex) {
    outIndices = [request.outIndex]
  }
  if (outIndices === undefined) {
    outIndices = null
  } else {
    outIndices = outIndices.map((v) => { return parseInt(v, 10) })
  }

  let result = await scandata.getTxColorValues(
    request.txId, outIndices, request.colorKernel || 'epobc')

  if (result.outputs.length === 0) {
    return null
  }

  let outputColorValues = result.outputs[0].outputs
  if (result.outputs.length > 1) { // handle multiple colors
    for (let index = 1; index < result.outputs.length; index += 1) {
      let cvoutputs = result.outputs[index].outputs
      for (let [outIndex, cv] of cvoutputs.entries()) {
        if (cv !== null) {
          if (outputColorValues[outIndex] !== null) {
            throw new Error(`Two colorvalues for one output, ${cv.toString()} and ${outputColorValues[outIndex].toString()}`)
          }
          outputColorValues[outIndex] = cv
        }
      }
    }
  }

  return outputColorValues.map((cv) => {
    if (cv === null) {
      return null
    }

    return {
      color: cv.getColorDefinition().getDesc(),
      value: cv.getValue()
    }
  })
}, (result) => { return {colorValues: result} })

app.use('/api', api)

export function startServer (opts) {
  scandata = opts.scandata
  return new Promise((resolve, reject) => {
    let server = app.listen(opts.port, (err) => {
      if (err) {
        return reject(err)
      }

      console.log('Listening on port %d', server.address().port)
      resolve(server)
    })
  })
}
