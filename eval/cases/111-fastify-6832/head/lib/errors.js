  ),
  FST_ERR_ROUTE_METHOD_NOT_SUPPORTED: createError(
    'FST_ERR_ROUTE_METHOD_NOT_SUPPORTED',
    '%s method is not supported.',
    500
  ),
  FST_ERR_ROUTE_LOG_LEVEL_INVALID: createError(
    'FST_ERR_ROUTE_LOG_LEVEL_INVALID',
    "Log level for '%s:%s' route must be a valid logger level. Received: '%s'",
    500,
    TypeError
  ),
  FST_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED: createError(
    'FST_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED',
    'Body validation schema for %s:%s route is not supported!',
    500
  ),
  FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT: createError(
    'FST_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT',
    "'bodyLimit' option must be an integer > 0. Got '%s'",
    500,
    TypeError
  ),
  FST_ERR_HANDLER_TIMEOUT: createError(
    'FST_ERR_HANDLER_TIMEOUT',
    "Request timed out after %s ms on route '%s'",
    503
  ),
  FST_ERR_ROUTE_HANDLER_TIMEOUT_OPTION_NOT_INT: createError(
    'FST_ERR_ROUTE_HANDLER_TIMEOUT_OPTION_NOT_INT',
    "'handlerTimeout' option must be an integer > 0. Got '%s'",
    500,
    TypeError
  ),
  FST_ERR_ROUTE_REWRITE_NOT_STR: createError(
    'FST_ERR_ROUTE_REWRITE_NOT_STR',
    'Rewrite url for "%s" needs to be of type "string" but received "%s"',
    500,
    TypeError
  ),
  FST_ERR_ROUTE_MISSING_CONTENT_TYPE: createError(
    'FST_ERR_ROUTE_MISSING_CONTENT_TYPE',
    "Method '%s' must provide a 'Content-Type' header.",
    400
  ),
  FST_ERR_ROUTE_MISSING_CONTENT: createError(
    'FST_ERR_ROUTE_MISSING_CONTENT',
    "Method '%s' must provide a request body.",
    400
  ),

  /**
   *  again listen when close server
   */
  FST_ERR_REOPENED_CLOSE_SERVER: createError(
    'FST_ERR_REOPENED_CLOSE_SERVER',
    'Fastify has already been closed and cannot be reopened'
  ),
  FST_ERR_REOPENED_SERVER: createError(
    'FST_ERR_REOPENED_SERVER',
    'Fastify is already listening'
  ),
  FST_ERR_INSTANCE_ALREADY_LISTENING: createError(
    'FST_ERR_INSTANCE_ALREADY_LISTENING',
    'Fastify instance is already listening. %s'
  ),

  /**
   * plugin
   */
  FST_ERR_PLUGIN_VERSION_MISMATCH: createError(
    'FST_ERR_PLUGIN_VERSION_MISMATCH',
    "fastify-plugin: %s - expected '%s' fastify version, '%s' is installed"
  ),
  FST_ERR_PLUGIN_NOT_PRESENT_IN_INSTANCE: createError(
    'FST_ERR_PLUGIN_NOT_PRESENT_IN_INSTANCE',
    "The decorator '%s'%s is not present in %s"
  ),
  FST_ERR_PLUGIN_INVALID_ASYNC_HANDLER: createError(
    'FST_ERR_PLUGIN_INVALID_ASYNC_HANDLER',
    'The %s plugin being registered mixes async and callback styles. Async plugin should not mix async and callback style.',
    500,
    TypeError
  ),
  FST_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED: createError(
    'FST_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED',
    "The dependency '%s' of plugin '%s' is not registered"
  ),
  /**
   *  Avvio Errors
