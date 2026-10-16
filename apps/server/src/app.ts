import 'reflect-metadata';
import {
  ArgumentsHost, Body, Catch, Controller, Get, HttpException, Inject, Module,
  Param, Patch, Post, Query, type ExceptionFilter,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DomainError, pagination, type NotesRepository } from '../../../packages/core/src/notes.ts';

import { parseLanHost } from './network.ts';
import { noteQuery } from '../../../packages/core/src/note-query.ts';

const REPOSITORY = Symbol('notes.repository');

@Controller('api/v1/notes')
class NotesController {
  constructor(@Inject(REPOSITORY) private readonly notes: NotesRepository) {}

  @Get()
  list(@Query('offset') offset?: string, @Query('limit') limit?: string,
    @Query('q') q?: string, @Query('sort') sort?: string,
    @Query('tagIds') tagIds?: string, @Query('tagMode') tagMode?: string) {
    const page = pagination(offset, limit);
    return this.notes.list(page.offset, page.limit, noteQuery({ q, sort, tagIds, tagMode }));
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.notes.get(id); }

  @Post()
  create(@Body() value: unknown) { return this.notes.create(value); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() value: unknown) { return this.notes.update(id, value); }
}

@Controller('api/v1/tags')
class TagsController {
  constructor(@Inject(REPOSITORY) private readonly notes: NotesRepository) {}
  @Get()
  list() { return this.notes.listTags(); }
  @Post()
  create(@Body() value: unknown) { return this.notes.createTag(value); }
}

function databaseBusy(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: string; cause?: unknown };
  return value.code === 'SQLITE_BUSY' || value.code === 'SQLITE_LOCKED'
    || (value.cause !== undefined && databaseBusy(value.cause));
}

@Catch()
class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof DomainError) {
      const status = error.code === 'NOT_FOUND' ? 404 : ['REVISION_CONFLICT', 'TAG_EXISTS'].includes(error.code) ? 409 : 400;
      response.status(status).json({ error: { code: error.code, message: error.message } });
    } else if (databaseBusy(error)) {
      response.status(503).json({ error: { code: 'DATABASE_BUSY', message: 'La base de datos está ocupada. Tu borrador no se ha descartado.' } });
    } else if (error instanceof HttpException && error.getStatus() === 404) {
      response.status(404).json({ error: { code: 'NOT_FOUND', message: 'No se encontró este recurso.' } });
    } else {
      console.error('Fallo interno de Notas.', error instanceof Error ? error.name : 'Error');
      response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'No se pudo completar la operación.' } });
    }
  }
}

export async function createApp(repository: NotesRepository, webRoot = resolve('dist/web/browser'), options: { lanHost?: string } = {}) {
  const lanHost = parseLanHost(options.lanHost);
  @Module({
    controllers: [NotesController, TagsController],
    providers: [{ provide: REPOSITORY, useValue: repository }],
  })
  class AppModule {}

  const app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
  app.use((request: Request, response: Response, next: () => void) => {
    response.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    const host = request.headers.host;
    const port = request.socket.localPort;
    const allowed = host === '127.0.0.1:' + port || host === 'localhost:' + port
      || (lanHost !== undefined && host === lanHost + ':' + port);
    if (!allowed || (request.headers.origin !== undefined && request.headers.origin !== 'http://' + host)
      || request.headers['sec-fetch-site'] === 'cross-site') {
      response.status(403).json({ error: { code: 'LOCAL_ONLY', message: 'Bitnode acepta solo solicitudes de su origen configurado.' } });
      return;
    }
    if (request.path.startsWith('/api/')) {
      response.set('Cache-Control', 'no-store');
      if (['POST', 'PATCH', 'PUT'].includes(request.method) && !request.is('application/json')) {
        response.status(415).json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Usa application/json.' } });
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  const bodyErrors: ErrorRequestHandler = (error, _request, response, next) => {
    if (error?.type === 'entity.too.large') {
      response.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'La solicitud admite hasta 2 MiB.' } });
    } else if (error?.type === 'entity.parse.failed') {
      response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'El JSON de la solicitud no es válido.' } });
    } else { next(error); }
  };
  app.use(bodyErrors);
  if (existsSync(resolve(webRoot, 'index.html'))) {
    app.use(express.static(webRoot, { index: 'index.html' }));
  }
  app.useGlobalFilters(new ApiErrors());
  await app.init();
  return app;
}
