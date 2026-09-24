import * as http from 'node:http'
import { FastifyError } from '@fastify/error'
import { expect } from 'tstyche'
import fastify, { FastifyInstance, FastifyReply, FastifyRequest, RouteHandlerMethod } from '../../fastify.js'
import { RequestPayload } from '../../types/hooks.js'
import { FindMyWayFindResult } from '../../types/instance.js'
import { HTTPMethods, RawServerDefault } from '../../types/utils.js'

/*
 * Testing Fastify HTTP Routes and Route Shorthands.
 * Verifies Request and Reply types as well.
 * For the route shorthand tests the argument orders are:
 * - `(path, handler)`
 * - `(path, options, handler)`
 * - `(path, options)`
 */

declare module '../../fastify' {
  interface FastifyContextConfig {
    foo: string;
    bar: number;
    includeMessage?: boolean;
  }

  interface FastifyRequest<
    RouteGeneric,
    RawServer,
    RawRequest,
    SchemaCompiler,
    TypeProvider,
    ContextConfig,
    Logger,
    RequestType
  > {
    message: ContextConfig extends { includeMessage: true }
      ? string
      : null;
  }
}

const routeHandler: RouteHandlerMethod = function (request, reply) {
  expect(this).type.toBe<FastifyInstance>()
  expect(request).type.toBe<FastifyRequest>()
  expect(reply).type.toBe<FastifyReply>()
}

const routeHandlerWithReturnValue: RouteHandlerMethod = function (request, reply) {
  expect(this).type.toBe<FastifyInstance>()
  expect(request).type.toBe<FastifyRequest>()
  expect(reply).type.toBe<FastifyReply>()

  return reply.send()
}

const asyncPreHandler = async (request: FastifyRequest) => {
  expect(request).type.toBe<FastifyRequest>()
}

fastify().get('/', { preHandler: asyncPreHandler }, async () => 'this is an example')

fastify().get(
  '/',
  { config: { foo: 'bar', bar: 100, includeMessage: true } },
  (req) => {
    expect(req.message).type.toBe<string>()
  }
)

fastify().get(
  '/',
  { config: { foo: 'bar', bar: 100, includeMessage: false } },
  (req) => {
    expect(req.message).type.toBe<null>()
  }
)

type LowerCaseHTTPMethods = 'delete' | 'get' | 'head' | 'patch' | 'post' | 'put' |
  'options' | 'propfind' | 'proppatch' | 'mkcol' | 'copy' | 'move' | 'lock' |
  'unlock' | 'trace' | 'search' | 'mkcalendar' | 'report'

  ;['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT', 'OPTIONS', 'PROPFIND',
  'PROPPATCH', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK', 'TRACE', 'SEARCH', 'MKCALENDAR', 'REPORT'
].forEach(method => {
  // route method
  expect(fastify().route({
    method: method as HTTPMethods,
    url: '/',
    handler: routeHandler
  })).type.toBe<FastifyInstance>()

  const lowerCaseMethod: LowerCaseHTTPMethods = method.toLowerCase() as LowerCaseHTTPMethods

  // method as method
  expect(fastify()[lowerCaseMethod]('/', routeHandler)).type.toBe<FastifyInstance>()
  expect(fastify()[lowerCaseMethod]('/', {}, routeHandler)).type.toBe<FastifyInstance>()
  expect(fastify()[lowerCaseMethod]('/', { handler: routeHandler })).type.toBe<FastifyInstance>()

  expect(fastify()[lowerCaseMethod]('/', {
    handler: routeHandler,
    errorHandler: (error, request, reply) => {
      expect(error).type.toBe<FastifyError>()
      reply.send('error')
    },
    childLoggerFactory: function (logger, bindings, opts) {
      return logger.child(bindings, opts)
    }
  })).type.toBe<FastifyInstance>()

  interface BodyInterface { prop: string }
  interface QuerystringInterface { prop: number }
  interface ParamsInterface { prop: boolean }
  interface HeadersInterface { prop: string }
  interface RouteSpecificContextConfigType {
    extra: boolean
  }
  interface RouteGeneric {
    Body: BodyInterface;
    Querystring: QuerystringInterface;
    Params: ParamsInterface;
    Headers: HeadersInterface;
  }
