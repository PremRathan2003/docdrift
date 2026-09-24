'use strict'

const { test } = require('node:test')
const http = require('node:http')
const NotFound = require('http-errors').NotFound
const Request = require('../../lib/request')
const Reply = require('../../lib/reply')
const { LogController } = require('../../lib/log-controller')
const Fastify = require('../..')
const { Readable, Writable } = require('node:stream')
const {
  kReplyErrorHandlerCalled,
  kReplyHeaders,
  kReplySerializer,
  kReplyIsError,
  kReplySerializerDefault,
  kRouteContext,
  kLogController
} = require('../../lib/symbols')
const fs = require('node:fs')
const path = require('node:path')

const doGet = async function (url) {
  const result = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    keepAlive: false
  })

  return {
    response: result,
    body: await result.json().catch(() => undefined)
  }
}

test('Once called, Reply should return an object with methods', t => {
  t.plan(16)
  const response = { res: 'res' }
  const context = {
    config: { onSend: [] },
    schema: {},
    _parserOptions: {},
    server: { hasConstraintStrategy: () => false, initialConfig: {} }
  }
  const request = new Request(null, null, null, null, null, context)
  const reply = new Reply(response, request)
  t.assert.strictEqual(typeof reply, 'object')
  t.assert.strictEqual(typeof reply[kReplyIsError], 'boolean')
  t.assert.strictEqual(typeof reply[kReplyErrorHandlerCalled], 'boolean')
  t.assert.strictEqual(typeof reply.send, 'function')
  t.assert.strictEqual(typeof reply.code, 'function')
  t.assert.strictEqual(typeof reply.mediaType, 'string')
  t.assert.strictEqual(typeof reply.status, 'function')
  t.assert.strictEqual(typeof reply.header, 'function')
  t.assert.strictEqual(typeof reply.serialize, 'function')
  t.assert.strictEqual(typeof reply[kReplyHeaders], 'object')
  t.assert.deepStrictEqual(reply.raw, response)
  t.assert.strictEqual(reply[kRouteContext], context)
  t.assert.strictEqual(reply.routeOptions.config, context.config)
  t.assert.strictEqual(reply.routeOptions.schema, context.schema)
  t.assert.strictEqual(reply.request, request)
  // Aim to not bad property keys (including Symbols)
  t.assert.ok(!('undefined' in reply))
})

test('reply.send will logStream error and destroy the stream', t => {
  t.plan(1)
  let destroyCalled
  const payload = new Readable({
    read () { },
    destroy (err, cb) {
      destroyCalled = true
      cb(err)
    }
  })

  const response = new Writable()
  Object.assign(response, {
    setHeader: () => { },
    hasHeader: () => false,
    getHeader: () => undefined,
    writeHead: () => { },
    write: () => { },
    headersSent: true
  })

  const log = {
    warn: () => { }
  }

  const fakeRequest = {
    [kRouteContext]: {
