import * as http from 'node:http'
import * as http2 from 'node:http2'
import * as https from 'node:https'
import { Socket } from 'node:net'

import { BuildCompilerFromPool, ValidatorFactory } from '@fastify/ajv-compiler'
import { FastifyError } from '@fastify/error'
import { Options as FJSOptions, SerializerFactory } from '@fastify/fast-json-stringify-compiler'
import { ConstraintStrategy, Config as FindMyWayConfig, HTTPVersion } from 'find-my-way'
import { InjectOptions, CallbackFunc as LightMyRequestCallback, Chain as LightMyRequestChain, Response as LightMyRequestResponse } from 'light-my-request'

import { AddContentTypeParser, ConstructorAction, FastifyBodyParser, FastifyContentTypeParser, getDefaultJsonParser, hasContentTypeParser, ProtoAction } from './types/content-type-parser'
import { FastifyContextConfig } from './types/context'
import { FastifyErrorCodes } from './types/errors'
import { DoneFuncWithErrOrRes, HookHandlerDoneFunction, onCloseAsyncHookHandler, onCloseHookHandler, onErrorAsyncHookHandler, onErrorHookHandler, onListenAsyncHookHandler, onListenHookHandler, onReadyAsyncHookHandler, onReadyHookHandler, onRegisterHookHandler, onRequestAbortAsyncHookHandler, onRequestAbortHookHandler, onRequestAsyncHookHandler, onRequestHookHandler, onResponseAsyncHookHandler, onResponseHookHandler, onRouteHookHandler, onSendAsyncHookHandler, onSendHookHandler, onTimeoutAsyncHookHandler, onTimeoutHookHandler, preCloseAsyncHookHandler, preCloseHookHandler, preHandlerAsyncHookHandler, preHandlerHookHandler, preParsingAsyncHookHandler, preParsingHookHandler, preSerializationAsyncHookHandler, preSerializationHookHandler, preValidationAsyncHookHandler, preValidationHookHandler, RequestPayload } from './types/hooks'
import { FastifyInstance, FastifyListenOptions, PrintRoutesOptions } from './types/instance'
import {
  FastifyBaseLogger,
  FastifyChildLoggerFactory,
  LogController as LogControllerClass,
  FastifyLogFn,
  FastifyLoggerOptions,
  LogLevel,
  PinoLoggerOptions
} from './types/logger'
import { FastifyPluginAsync, FastifyPluginCallback, FastifyPluginOptions } from './types/plugin'
import { FastifyRegister, FastifyRegisterOptions, RegisterOptions } from './types/register'
import { FastifyReply } from './types/reply'
import { FastifyRequest, RequestGenericInterface } from './types/request'
import { RouteGenericInterface, RouteHandler, RouteHandlerMethod, RouteOptions, RouteShorthandMethod, RouteShorthandOptions, RouteShorthandOptionsWithHandler } from './types/route'
import { FastifySchema, FastifySchemaCompiler, FastifySchemaValidationError, FastifySerializerCompiler, SchemaErrorDataVar, SchemaErrorFormatter } from './types/schema'
import { FastifyServerFactory, FastifyServerFactoryHandler } from './types/server-factory'
import { FastifyTypeProvider, FastifyTypeProviderDefault, SafePromiseLike } from './types/type-provider'
import { ContextConfigDefault, HTTPMethods, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase, RawServerDefault, RequestBodyDefault, RequestHeadersDefault, RequestParamsDefault, RequestQuerystringDefault } from './types/utils'

declare module '@fastify/error' {
  interface FastifyError {
    validationContext?: SchemaErrorDataVar;
    validation?: FastifySchemaValidationError[];
  }
}

type Fastify = typeof fastify

declare namespace fastify {
  export const errorCodes: FastifyErrorCodes
  export { LogControllerClass as LogController }

  export type FastifyHttp2SecureOptions<
    Server extends http2.Http2SecureServer,
    Logger extends FastifyBaseLogger = FastifyBaseLogger
  > = FastifyServerOptions<Server, Logger> & {
    http2: true,
… trimmed for the evaluation dataset …
        FastifyContextConfig,
        SchemaCompiler,
        TypeProvider
      >
    ) => void,
    rewriteUrl?: (
      // The RawRequestDefaultExpression, RawReplyDefaultExpression, and FastifyTypeProviderDefault parameters
      // should be narrowed further but those generic parameters are not passed to this FastifyServerOptions type
      this: FastifyInstance<
        RawServer,
        RawRequestDefaultExpression<RawServer>,
        RawReplyDefaultExpression<RawServer>,
        Logger,
        FastifyTypeProviderDefault
      >,
      req: RawRequestDefaultExpression<RawServer>
    ) => string,
    schemaErrorFormatter?: SchemaErrorFormatter,
    /**
     * listener to error events emitted by client connections
     */
    clientErrorHandler?: (error: ConnectionError, socket: Socket) => void,
    childLoggerFactory?: FastifyChildLoggerFactory,
    allowErrorHandlerOverride?: boolean
    routerOptions?: FastifyRouterOptions<RawServer>,
  }

  /**
   * @deprecated use {@link FastifySchemaValidationError}
   */
  export type ValidationResult = FastifySchemaValidationError

  /* Export additional types */
  export type {
    LightMyRequestChain, InjectOptions, LightMyRequestResponse, LightMyRequestCallback, // 'light-my-request'
    FastifyRequest, RequestGenericInterface, // './types/request'
    FastifyReply, // './types/reply'
    FastifyPluginCallback, FastifyPluginAsync, FastifyPluginOptions, // './types/plugin'
    FastifyListenOptions, FastifyInstance, PrintRoutesOptions, // './types/instance'
    FastifyLoggerOptions, FastifyBaseLogger, FastifyLogFn, LogLevel, // './types/logger'
    FastifyContextConfig, // './types/context'
    RouteHandler, RouteHandlerMethod, RouteOptions, RouteShorthandMethod, RouteShorthandOptions,
    RouteShorthandOptionsWithHandler, RouteGenericInterface, // './types/route'
    FastifyRegister, FastifyRegisterOptions, RegisterOptions, // './types/register'
    FastifyBodyParser, FastifyContentTypeParser, AddContentTypeParser, hasContentTypeParser, getDefaultJsonParser,
    ProtoAction, ConstructorAction, // './types/content-type-parser'
    FastifyError, // '@fastify/error'
    FastifySchema, FastifySchemaValidationError, FastifySchemaCompiler, FastifySerializerCompiler, // './types/schema'
    HTTPMethods, RawServerBase, RawRequestDefaultExpression, RawReplyDefaultExpression, RawServerDefault,
    ContextConfigDefault, RequestBodyDefault, RequestQuerystringDefault, RequestParamsDefault, RequestHeadersDefault,
    // './types/utils'
    DoneFuncWithErrOrRes, HookHandlerDoneFunction, RequestPayload, onCloseAsyncHookHandler, onCloseHookHandler,
    onErrorAsyncHookHandler, onErrorHookHandler, onReadyAsyncHookHandler, onReadyHookHandler,
    onListenAsyncHookHandler, onListenHookHandler, onRegisterHookHandler, onRequestAsyncHookHandler,
    onRequestHookHandler, onResponseAsyncHookHandler, onResponseHookHandler, onRouteHookHandler,
    onSendAsyncHookHandler, onSendHookHandler, onTimeoutAsyncHookHandler, onTimeoutHookHandler,
    preHandlerAsyncHookHandler, preHandlerHookHandler, preParsingAsyncHookHandler, preParsingHookHandler,
    preSerializationAsyncHookHandler, preSerializationHookHandler, preValidationAsyncHookHandler,
    preValidationHookHandler, onRequestAbortHookHandler, onRequestAbortAsyncHookHandler, preCloseAsyncHookHandler,
    preCloseHookHandler, // './types/hooks'
    FastifyServerFactory, FastifyServerFactoryHandler, // './types/serverFactory'
    FastifyTypeProvider, FastifyTypeProviderDefault, SafePromiseLike, // './types/type-provider'
    FastifyErrorCodes // './types/errors'
  }
  // named export
  // import { plugin } from 'plugin'
  // const { plugin } = require('plugin')
  export const fastify: Fastify
  // default export
  // import plugin from 'plugin'
  export { fastify as default }
}

/**
 * Fastify factory function for the standard fastify http, https, or http2 server instance.
 *
 * The default function utilizes http
 *
 * @param opts Fastify server options
 * @returns Fastify server instance
 */
