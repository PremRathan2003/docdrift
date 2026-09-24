  ),
  FST_ERR_ASYNC_CONSTRAINT: createError(
    'FST_ERR_ASYNC_CONSTRAINT',
    'Unexpected error from async constraint',
    500
  ),
  FST_ERR_INVALID_URL: createError(
    'FST_ERR_INVALID_URL',
    "URL must be a string. Received '%s'",
    400,
    TypeError
  ),
  FST_ERR_ROUTE_OPTIONS_NOT_OBJ: createError(
    'FST_ERR_ROUTE_OPTIONS_NOT_OBJ',
    'Options for "%s:%s" route must be an object',
    500,
    TypeError
  ),
  FST_ERR_ROUTE_DUPLICATED_HANDLER: createError(
    'FST_ERR_ROUTE_DUPLICATED_HANDLER',
    'Duplicate handler for "%s:%s" route is not allowed!',
    500
  ),
  FST_ERR_ROUTE_HANDLER_NOT_FN: createError(
    'FST_ERR_ROUTE_HANDLER_NOT_FN',
    'Error Handler for %s:%s route, if defined, must be a function',
    500,
    TypeError
  ),
  FST_ERR_ROUTE_MISSING_HANDLER: createError(
    'FST_ERR_ROUTE_MISSING_HANDLER',
    'Missing handler function for "%s:%s" route.',
    500
  ),
  FST_ERR_ROUTE_METHOD_INVALID: createError(
    'FST_ERR_ROUTE_METHOD_INVALID',
    'Provided method is invalid!',
    500,
    TypeError
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
