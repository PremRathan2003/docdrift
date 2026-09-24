  FST_ERR_MISSING_SERIALIZATION_FN,
  FST_ERR_MISSING_CONTENTTYPE_SERIALIZATION_FN,
  FST_ERR_DEC_UNDECLARED
} = require('./errors')
const decorators = require('./decorate')
const ContentType = require('./content-type.js')

const toString = Object.prototype.toString
const HTTP2_WRITE_CHUNK_SIZE = 64 * 1024

function Reply (res, request, log) {
  this.raw = res
  this[kReplySerializer] = null
  this[kReplyErrorHandlerCalled] = false
  this[kReplyIsError] = false
  this[kReplyIsRunningOnErrorHook] = false
  this.request = request
  this[kReplyHeaders] = {}
  this[kReplyTrailers] = null
  this[kReplyHasStatusCode] = false
  this[kReplyStartTime] = undefined
  this.log = log
}
Reply.props = []
Reply.instanceProperties = new Set(['raw', 'request', 'log'])

Object.defineProperties(Reply.prototype, {
  [kRouteContext]: {
    get () {
      return this.request[kRouteContext]
    }
  },
  elapsedTime: {
    get () {
      if (this[kReplyStartTime] === undefined) {
        return 0
      }
      return (this[kReplyEndTime] || now()) - this[kReplyStartTime]
    }
  },
  server: {
    get () {
      return this.request[kRouteContext].server
    }
  },
  sent: {
    enumerable: true,
    get () {
      // We are checking whether reply was hijacked or the response has ended.
      return (this[kReplyHijacked] || this.raw.writableEnded) === true
    }
  },
  statusCode: {
    get () {
      return this.raw.statusCode
    },
    set (value) {
      this.code(value)
    }
  },
  routeOptions: {
    get () {
      return this.request.routeOptions
    }
  }
})

Reply.prototype.writeEarlyHints = function (hints, callback) {
  this.raw.writeEarlyHints(hints, callback)
  return this
}

Reply.prototype.hijack = function () {
  this[kReplyHijacked] = true
  // Clear handler timeout and signal — hijacked replies manage their own lifecycle
  if (this.request[kRequestSignal]) {
    clearTimeout(this.request[kTimeoutTimer])
    this.request[kTimeoutTimer] = null
    if (this.request[kOnAbort]) {
      this.request.raw.removeListener('close', this.request[kOnAbort])
