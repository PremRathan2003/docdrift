} = require('./lib/symbols.js')

const { createServer } = require('./lib/server')
const Reply = require('./lib/reply')
const Request = require('./lib/request')
const Context = require('./lib/context.js')
const decorator = require('./lib/decorate')
const ContentTypeParser = require('./lib/content-type-parser.js')
const SchemaController = require('./lib/schema-controller')
const { Hooks, hookRunnerApplication, supportedHooks } = require('./lib/hooks')
const { createChildLogger, defaultChildLoggerFactory, createLogger, createLogController, LogController } = require('./lib/logger-factory')
const pluginUtils = require('./lib/plugin-utils.js')
const { getGenReqId, reqIdGenFactory } = require('./lib/req-id-gen-factory.js')
const { buildRouting, validateBodyLimitOption, buildRouterOptions } = require('./lib/route')
const build404 = require('./lib/four-oh-four')
const getSecuredInitialConfig = require('./lib/initial-config-validation.js')
const override = require('./lib/plugin-override')
const {
  appendStackTrace,
  AVVIO_ERRORS_MAP,
  ...errorCodes
} = require('./lib/errors')

const { defaultInitOptions } = getSecuredInitialConfig

const {
  FST_ERR_ASYNC_CONSTRAINT,
  FST_ERR_BAD_URL,
  FST_ERR_MAX_PARAM_LENGTH,
  FST_ERR_OPTIONS_NOT_OBJ,
  FST_ERR_QSP_NOT_FN,
  FST_ERR_SCHEMA_CONTROLLER_BUCKET_OPT_NOT_FN,
  FST_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_OBJ,
  FST_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_ARR,
  FST_ERR_INSTANCE_ALREADY_STARTED,
  FST_ERR_REOPENED_CLOSE_SERVER,
  FST_ERR_ROUTE_REWRITE_NOT_STR,
  FST_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN,
  FST_ERR_ERROR_HANDLER_NOT_FN,
  FST_ERR_ERROR_HANDLER_ALREADY_SET,
  FST_ERR_ROUTE_METHOD_INVALID,
  FST_ERR_ROUTE_METHOD_ALREADY_SUPPORTED
} = errorCodes

const { buildErrorHandler } = require('./lib/error-handler.js')

const initChannel = diagnostics.channel('fastify.initialization')

/**
 * @param {import('./fastify.js').FastifyServerOptions} serverOptions
 */
function fastify (serverOptions) {
  const {
    options,
    genReqId,
    logController,
    hasLogger,
    initialConfig
  } = processOptions(serverOptions, defaultRoute, onBadUrl, onMaxParamLength)

  // Default router
  const router = buildRouting(options.routerOptions)

  // 404 router, used for handling encapsulated 404 handlers
  const fourOhFour = build404(options)

  // HTTP server and its handler
  const httpHandler = wrapRouting(router, options)

  const {
    server,
    listen,
    forceCloseConnections,
    serverHasCloseAllConnections,
    serverHasCloseHttp2Sessions,
    keepAliveConnections
  } = createServer(options, httpHandler)

  const setupResponseListeners = Reply.setupResponseListeners
  const schemaController = SchemaController.buildSchemaController(null, options.schemaController)

  // Public API
  const fastify = {
    // Fastify internals
    [kState]: {
… trimmed for the evaluation dataset …
      ? opts.includeMeta ? supportedHooks.concat(opts.includeMeta) : supportedHooks
      : opts.includeMeta
    return router.printRoutes(opts)
  }

  function wrapRouting (router, { rewriteUrl, logger }) {
    let isAsync
    return function preRouting (req, res) {
      // only call isAsyncConstraint once
      if (isAsync === undefined) isAsync = router.isAsyncConstraint()
      if (rewriteUrl) {
        req.originalUrl = req.url
        const url = rewriteUrl.call(fastify, req)
        if (typeof url === 'string') {
          req.url = url
        } else {
          const err = new FST_ERR_ROUTE_REWRITE_NOT_STR(req.url, typeof url)
          req.destroy(err)
        }
      }
      router.routing(req, res, buildAsyncConstraintCallback(isAsync, req, res))
    }
  }

  function setGenReqId (func) {
    throwIfAlreadyStarted('Cannot call "setGenReqId"!')

    this[kGenReqId] = reqIdGenFactory(this[kOptions].requestIdHeader, func)
    return this
  }

  function addHttpMethod (method, { hasBody = false, overrideExisting = false } = {}) {
    if (typeof method !== 'string' || http.METHODS.indexOf(method) === -1) {
      throw new FST_ERR_ROUTE_METHOD_INVALID()
    }

    const alreadyExists = this[kSupportedHTTPMethods].bodyless.has(method) ||
      this[kSupportedHTTPMethods].bodywith.has(method)

    if (alreadyExists && !overrideExisting) {
      throw new FST_ERR_ROUTE_METHOD_ALREADY_SUPPORTED(method)
    }

    if (hasBody === true) {
      this[kSupportedHTTPMethods].bodywith.add(method)
      this[kSupportedHTTPMethods].bodyless.delete(method)
    } else {
      this[kSupportedHTTPMethods].bodywith.delete(method)
      this[kSupportedHTTPMethods].bodyless.add(method)
    }

    const _method = method.toLowerCase()
    if (!this.hasDecorator(_method)) {
      this.decorate(_method, function (url, options, handler) {
        return router.prepareRoute.call(this, { method, url, options, handler })
      })
    }

    return this
  }
}

function processOptions (options, defaultRoute, onBadUrl, onMaxParamLength) {
  // Options validations
  if (options && typeof options !== 'object') {
    throw new FST_ERR_OPTIONS_NOT_OBJ()
  } else {
    // Shallow copy options object to prevent mutations outside of this function
    options = Object.assign({}, options)
  }

  if (
    options.routerOptions?.querystringParser &&
      typeof options.routerOptions.querystringParser !== 'function'
  ) {
    throw new FST_ERR_QSP_NOT_FN(typeof options.routerOptions.querystringParser)
  }

  if (options.schemaController && options.schemaController.bucket && typeof options.schemaController.bucket !== 'function') {
    throw new FST_ERR_SCHEMA_CONTROLLER_BUCKET_OPT_NOT_FN(typeof options.schemaController.bucket)
  }
