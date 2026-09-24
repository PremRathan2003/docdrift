import { FastifyError } from '@fastify/error'
import { ConstraintStrategy, FindResult, HTTPVersion } from 'find-my-way'
import * as http from 'node:http'
import { InjectOptions, CallbackFunc as LightMyRequestCallback, Chain as LightMyRequestChain, Response as LightMyRequestResponse } from 'light-my-request'
import { AddressInfo } from 'node:net'
import { AddContentTypeParser, ConstructorAction, FastifyBodyParser, ProtoAction, getDefaultJsonParser, hasContentTypeParser, removeAllContentTypeParsers, removeContentTypeParser } from './content-type-parser'
import { ApplicationHook, HookAsyncLookup, HookLookup, LifecycleHook, onCloseAsyncHookHandler, onCloseHookHandler, onErrorAsyncHookHandler, onErrorHookHandler, onListenAsyncHookHandler, onListenHookHandler, onReadyAsyncHookHandler, onReadyHookHandler, onRegisterHookHandler, onRequestAbortAsyncHookHandler, onRequestAbortHookHandler, onRequestAsyncHookHandler, onRequestHookHandler, onResponseAsyncHookHandler, onResponseHookHandler, onRouteHookHandler, onSendAsyncHookHandler, onSendHookHandler, onTimeoutAsyncHookHandler, onTimeoutHookHandler, preCloseAsyncHookHandler, preCloseHookHandler, preHandlerAsyncHookHandler, preHandlerHookHandler, preParsingAsyncHookHandler, preParsingHookHandler, preSerializationAsyncHookHandler, preSerializationHookHandler, preValidationAsyncHookHandler, preValidationHookHandler } from './hooks'
import { FastifyBaseLogger, FastifyChildLoggerFactory } from './logger'
import { FastifyRegister } from './register'
import { FastifyReply } from './reply'
import { FastifyRequest } from './request'
import { RouteGenericInterface, RouteHandlerMethod, RouteOptions, RouteShorthandMethod } from './route'
import {
  FastifySchema,
  FastifySchemaCompiler,
  FastifySchemaControllerOptions,
  FastifySerializerCompiler,
  SchemaErrorFormatter
} from './schema'
import {
  FastifyTypeProvider,
  FastifyTypeProviderDefault,
  SafePromiseLike
} from './type-provider'
import { ContextConfigDefault, HTTPMethods, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase, RawServerDefault } from './utils'
import { FastifyRouterOptions } from '../fastify'

export interface PrintRoutesOptions {
  method?: HTTPMethods;
  includeMeta?: boolean | (string | symbol)[]
  commonPrefix?: boolean
  includeHooks?: boolean
}

type AsyncFunction = (...args: any) => Promise<any>

export interface FastifyListenOptions {
  /**
   * Default to `0` (picks the first available open port).
   */
  port?: number;
  /**
   * Default to `localhost`.
   */
  host?: string;
  /**
   * Will be ignored if `port` is specified.
   * @see [Identifying paths for IPC connections](https://nodejs.org/api/net.html#identifying-paths-for-ipc-connections).
   */
  path?: string;
  /**
   * Specify the maximum length of the queue of pending connections.
   * The actual length will be determined by the OS through sysctl settings such as `tcp_max_syn_backlog` and `somaxconn` on Linux.
   * Default to `511`.
   */
  backlog?: number;
  /**
   * Default to `false`.
   */
  exclusive?: boolean;
  /**
   * For IPC servers makes the pipe readable for all users.
   * Default to `false`.
   */
  readableAll?: boolean;
  /**
… trimmed for the evaluation dataset …

  inject(opts: InjectOptions | string, cb: LightMyRequestCallback): void;
  inject(opts: InjectOptions | string): Promise<LightMyRequestResponse>;
  inject(): LightMyRequestChain;

  listen(opts: FastifyListenOptions, callback: (err: Error | null, address: string) => void): void;
  listen(opts?: FastifyListenOptions): Promise<string>;
  listen(callback: (err: Error | null, address: string) => void): void;

  ready(): FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider> & SafePromiseLike<undefined>;
  ready(readyListener: (err: Error | null) => void | Promise<void>): FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;

  register: FastifyRegister<FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider> & SafePromiseLike<undefined>>;

  routing(req: RawRequest, res: RawReply): void;

  route<
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    ContextConfig = ContextConfigDefault,
    const SchemaCompiler extends FastifySchema = FastifySchema
  >(opts: RouteOptions<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger>): FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;

  delete: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  get: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  head: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  patch: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  post: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  put: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  options: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  propfind: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  proppatch: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  mkcalendar: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  mkcol: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  copy: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  move: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  lock: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  unlock: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  trace: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  report: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  search: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;
  all: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider, Logger>;

  hasRoute<
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    ContextConfig = ContextConfigDefault,
    SchemaCompiler extends FastifySchema = FastifySchema
  >(opts: Pick<RouteOptions<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider>, 'method' | 'url' | 'constraints'>): boolean;

  findRoute<
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    ContextConfig = ContextConfigDefault,
    SchemaCompiler extends FastifySchema = FastifySchema
  >(opts: Pick<RouteOptions<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider>, 'method' | 'url' | 'constraints'>): Omit<FindMyWayFindResult<RawServer>, 'store'>;

  // addHook: overloads

  // Lifecycle addHooks

  /**
   * `onRequest` is the first hook to be executed in the request lifecycle. There was no previous hook, the next hook will be `preParsing`.
   *  Notice: in the `onRequest` hook, request.body will always be null, because the body parsing happens before the `preHandler` hook.
   */
  addHook<
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    ContextConfig = ContextConfigDefault,
    SchemaCompiler extends FastifySchema = FastifySchema,
    Logger extends FastifyBaseLogger = FastifyBaseLogger,
    Fn extends onRequestHookHandler<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger> | onRequestAsyncHookHandler<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger> = onRequestHookHandler<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger>
  >(
    name: 'onRequest',
    hook: Fn extends unknown ? Fn extends AsyncFunction ? onRequestAsyncHookHandler<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger> : onRequestHookHandler<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger> : Fn,
  ): FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;

  /**
   * `preParsing` is the second hook to be executed in the request lifecycle. The previous hook was `onRequest`, the next hook will be `preValidation`.
   * Notice: in the `preParsing` hook, request.body will always be null, because the body parsing happens before the `preHandler` hook.
   */
  addHook<
    RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
    ContextConfig = ContextConfigDefault,
… trimmed for the evaluation dataset …
  addHook<
    Fn extends onReadyHookHandler | onReadyAsyncHookHandler = onReadyHookHandler
  >(
    name: 'onReady',
    hook: Fn extends unknown ? Fn extends AsyncFunction ? onReadyAsyncHookHandler : onReadyHookHandler : Fn,
  ): FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;

  /**
  * Triggered when fastify.listen() is invoked to start the server. It is useful when plugins need a "onListen" event, for example to run logics after the server start listening for requests.
  */
  addHook<
    Fn extends onListenHookHandler<RawServer, RawRequest, RawReply, Logger, TypeProvider> | onListenAsyncHookHandler<RawServer, RawRequest, RawReply, Logger, TypeProvider> = onListenHookHandler<RawServer, RawRequest, RawReply, Logger, TypeProvider>
  >(
    name: 'onListen',
    hook: Fn extends unknown ? Fn extends AsyncFunction ? onListenAsyncHookHandler : onListenHookHandler : Fn,
  ): FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;

  /**
  * Triggered when fastify.close() is invoked to stop the server. It is useful when plugins need a "shutdown" event, for example to close an open connection to a database.
  */
  addHook<
    Fn extends onCloseHookHandler | onCloseAsyncHookHandler = onCloseHookHandler
  >(
    name: 'onClose',
    hook: Fn extends unknown ? Fn extends AsyncFunction ? onCloseAsyncHookHandler : onCloseHookHandler : Fn,
  ): FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;

  /**
  * Triggered when fastify.close() is invoked to stop the server. It is useful when plugins need to cancel some state to allow the server to close successfully.
  */
  addHook<
    Fn extends preCloseHookHandler | preCloseAsyncHookHandler = preCloseHookHandler
  >(
    name: 'preClose',
    hook: Fn extends unknown ? Fn extends AsyncFunction ? preCloseAsyncHookHandler : preCloseHookHandler : Fn,
  ): FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;

  addHook<
    K extends ApplicationHook | LifecycleHook,
    Fn extends (...args: any) => Promise<any> | any
  > (
    name: K,
    hook: Fn extends unknown ? Fn extends AsyncFunction ? HookAsyncLookup<K> : HookLookup<K> : Fn
  ): FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;

  /**
     * Set the 404 handler
     */
  setNotFoundHandler<RouteGeneric extends RouteGenericInterface = RouteGenericInterface, ContextConfig extends ContextConfigDefault = ContextConfigDefault, TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault, SchemaCompiler extends FastifySchema = FastifySchema> (
    handler: RouteHandlerMethod<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger>
  ): FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;

  setNotFoundHandler<RouteGeneric extends RouteGenericInterface = RouteGenericInterface, ContextConfig extends ContextConfigDefault = ContextConfigDefault, TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault, SchemaCompiler extends FastifySchema = FastifySchema> (
    opts: {
      preValidation?: preValidationHookHandler<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider> | preValidationAsyncHookHandler<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider> | preValidationHookHandler<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider>[] | preValidationAsyncHookHandler<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider>[];
      preHandler?: preHandlerHookHandler<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider> | preHandlerAsyncHookHandler<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider> | preHandlerHookHandler<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider>[] | preHandlerAsyncHookHandler<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider>[];
    },
    handler: RouteHandlerMethod<RawServer, RawRequest, RawReply, RouteGeneric, ContextConfig, SchemaCompiler, TypeProvider, Logger>
  ): FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>

  /**
   * Fastify default error handler
   */
  errorHandler: <TError = unknown>(error: TError, request: FastifyRequest, reply: FastifyReply) => void;

  /**
   * Set a function that will be invoked whenever an exception is thrown during the request lifecycle.
   */
  setErrorHandler<TError = unknown, RouteGeneric extends RouteGenericInterface = RouteGenericInterface, SchemaCompiler extends FastifySchema = FastifySchema, TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault>(
    handler: (this: FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>, error: TError, request: FastifyRequest<RouteGeneric, RawServer, RawRequest, SchemaCompiler, TypeProvider>, reply: FastifyReply<RouteGeneric, RawServer, RawRequest, RawReply, ContextConfigDefault, SchemaCompiler, TypeProvider>) => any | Promise<any>
  ): FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;

  /**
   * Set a function that will generate a request-ids
   */
  setGenReqId(fn: (req: RawRequestDefaultExpression<RawServer>) => string): FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>;

  /**
   * Hook function that is called when creating a child logger instance for each request
   * which allows for modifying or adding child logger bindings and logger options, or
   * returning a completely custom child logger implementation.
   */
  childLoggerFactory: FastifyChildLoggerFactory<RawServer, RawRequest, RawReply, Logger, TypeProvider>;

  /**
   * Hook function that is called when creating a child logger instance for each request
   * which allows for modifying or adding child logger bindings and logger options, or
   * returning a completely custom child logger implementation.
   *
   * Child logger bindings have a performance advantage over per-log bindings, because
   * they are pre-serialised by Pino when the child logger is created.
   *
   * For example:
