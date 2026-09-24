'use strict'

const { test } = require('node:test')
const errors = require('../../lib/errors')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const expectedErrors = 94

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
test('FST_ERR_ROUTE_DUPLICATED_HANDLER', t => {
  t.plan(5)
  const error = new errors.FST_ERR_ROUTE_DUPLICATED_HANDLER()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_ROUTE_DUPLICATED_HANDLER')
  t.assert.strictEqual(error.message, 'Duplicate handler for "%s:%s" route is not allowed!')
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof Error)
})

test('FST_ERR_ROUTE_HANDLER_NOT_FN', t => {
  t.plan(5)
  const error = new errors.FST_ERR_ROUTE_HANDLER_NOT_FN()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_ROUTE_HANDLER_NOT_FN')
  t.assert.strictEqual(error.message, 'Error Handler for %s:%s route, if defined, must be a function')
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof TypeError)
})

test('FST_ERR_ROUTE_MISSING_HANDLER', t => {
  t.plan(5)
  const error = new errors.FST_ERR_ROUTE_MISSING_HANDLER()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_ROUTE_MISSING_HANDLER')
  t.assert.strictEqual(error.message, 'Missing handler function for "%s:%s" route.')
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof Error)
})

test('FST_ERR_ROUTE_METHOD_INVALID', t => {
  t.plan(5)
  const error = new errors.FST_ERR_ROUTE_METHOD_INVALID()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_ROUTE_METHOD_INVALID')
  t.assert.strictEqual(error.message, 'Provided method is invalid!')
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof TypeError)
})

test('FST_ERR_ROUTE_METHOD_NOT_SUPPORTED', t => {
  t.plan(5)
  const error = new errors.FST_ERR_ROUTE_METHOD_NOT_SUPPORTED()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_ROUTE_METHOD_NOT_SUPPORTED')
  t.assert.strictEqual(error.message, '%s method is not supported.')
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof Error)
})

test('FST_ERR_ROUTE_LOG_LEVEL_INVALID', t => {
  t.plan(5)
  const error = new errors.FST_ERR_ROUTE_LOG_LEVEL_INVALID()
  t.assert.strictEqual(error.name, 'FastifyError')
  t.assert.strictEqual(error.code, 'FST_ERR_ROUTE_LOG_LEVEL_INVALID')
  t.assert.strictEqual(error.message, "Log level for '%s:%s' route must be a valid logger level. Received: '%s'")
  t.assert.strictEqual(error.statusCode, 500)
  t.assert.ok(error instanceof TypeError)
})

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

