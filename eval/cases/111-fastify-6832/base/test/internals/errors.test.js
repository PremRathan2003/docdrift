'use strict'

const { test } = require('node:test')
const errors = require('../../lib/errors')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const expectedErrors = 92

test(`should expose ${expectedErrors} errors`, t => {
  t.plan(1)
  const exportedKeys = Object.keys(errors)
  let counter = 0
  for (const key of exportedKeys) {
    if (errors[key].name === 'FastifyError') {
      counter++
    }
  }
  t.assert.strictEqual(counter, expectedErrors)
})

test('ensure name and codes of Errors are identical', t => {
  t.plan(expectedErrors)

  const exportedKeys = Object.keys(errors)
  for (const key of exportedKeys) {
    if (errors[key].name === 'FastifyError') {
      t.assert.strictEqual(key, new errors[key]().code, key)
    }
  }
})

test('FST_ERR_NOT_FOUND', t => {
  t.plan(5)
  const error = new errors.FST_ERR_NOT_FOUND()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_NOT_FOUND')
  t.assert.strictEqual(error.message, 'Not Found')
  t.assert.strictEqual(error.statusCode, 404)
  t.assert.ok(error instanceof Error)
})

test('FST_ERR_OPTIONS_NOT_OBJ', t => {
  t.plan(5)
  const error = new errors.FST_ERR_OPTIONS_NOT_OBJ()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_OPTIONS_NOT_OBJ')
  t.assert.strictEqual(error.message, 'Options must be an object')
… trimmed for the evaluation dataset …
test('FST_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED', t => {
  t.plan(5)
  const error = new errors.FST_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED')
  t.assert.strictEqual(error.message, 'Body validation schema for %s:%s route is not supported!')
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof Error)
})

test('FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT', t => {
  t.plan(5)
  const error = new errors.FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT')
  t.assert.strictEqual(error.message, "'bodyLimit' option must be an integer > 0. Got '%s'")
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof TypeError)
})

test('FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT', t => {
  t.plan(5)
  const error = new errors.FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT')
  t.assert.strictEqual(error.message, "'bodyLimit' option must be an integer > 0. Got '%s'")
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof TypeError)
})

test('FST_ERR_ROUTE_REWRITE_NOT_STR', t => {
  t.plan(5)
  const error = new errors.FST_ERR_ROUTE_REWRITE_NOT_STR()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_ROUTE_REWRITE_NOT_STR')
  t.assert.strictEqual(error.message, 'Rewrite url for "%s" needs to be of type "string" but received "%s"')
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof TypeError)
})

test('FST_ERR_REOPENED_CLOSE_SERVER', t => {
  t.plan(5)
  const error = new errors.FST_ERR_REOPENED_CLOSE_SERVER()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_REOPENED_CLOSE_SERVER')
  t.assert.strictEqual(error.message, 'Fastify has already been closed and cannot be reopened')
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof Error)
})

test('FST_ERR_REOPENED_SERVER', t => {
  t.plan(5)
  const error = new errors.FST_ERR_REOPENED_SERVER()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_REOPENED_SERVER')
  t.assert.strictEqual(error.message, 'Fastify is already listening')
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof Error)
})

test('FST_ERR_INSTANCE_ALREADY_LISTENING', t => {
  t.plan(5)
  const error = new errors.FST_ERR_INSTANCE_ALREADY_LISTENING()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_INSTANCE_ALREADY_LISTENING')
  t.assert.strictEqual(error.message, 'Fastify instance is already listening. %s')
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof Error)
})

test('FST_ERR_PLUGIN_VERSION_MISMATCH', t => {
  t.plan(5)
  const error = new errors.FST_ERR_PLUGIN_VERSION_MISMATCH()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_PLUGIN_VERSION_MISMATCH')
  t.assert.strictEqual(error.message, "fastify-plugin: %s - expected '%s' fastify version, '%s' is installed")
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof Error)
})

