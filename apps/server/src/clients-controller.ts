import {
  ArgumentsHost, Body, Catch, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put,
  Query, UseFilters, type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { clientQuery, type ClientsRepository } from '../../../packages/core/src/clients.ts';
import { ScopeConfirmationError } from '../../../packages/core/src/client-scope.ts';
import { DomainError, invalid, pagination } from '../../../packages/core/src/notes.ts';

export const CLIENTS_REPOSITORY = Symbol('clients.repository');

const CONFLICT_REASONS: Record<string, string> = {
  REVISION_CONFLICT: 'REVISION_MISMATCH', DUPLICATE_NAME: 'DUPLICATE_NAME', HAS_ASSOCIATIONS: 'HAS_ASSOCIATIONS',
};

/** Client-only mapping; the global filter keeps Notes' REVISION_CONFLICT code untouched. */
@Catch(DomainError)
class ClientErrors implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof ScopeConfirmationError) {
      const body = error.code === 'PREVIEW_CHANGED' ? { code: 'CONFLICT', reason: 'PREVIEW_CHANGED' } : { code: error.code };
      response.status(409).json({ error: { ...body, message: error.message, preview: error.preview } });
      return;
    }
    const reason = CONFLICT_REASONS[error.code];
    if (reason) response.status(409).json({ error: { code: 'CONFLICT', reason, message: error.message } });
    else response.status(error.code === 'NOT_FOUND' ? 404 : 400).json({ error: { code: error.code, message: error.message } });
  }
}

const LIST_PARAMETERS = ['offset', 'limit', 'scope', 'archived', 'q'];

@Controller('api/v1/clients')
@UseFilters(ClientErrors)
export class ClientsController {
  constructor(@Inject(CLIENTS_REPOSITORY) private readonly clients: ClientsRepository) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    if (Object.keys(query).some(key => !LIST_PARAMETERS.includes(key))) invalid('La consulta contiene parámetros no admitidos.');
    const page = pagination(query.offset, query.limit);
    return this.clients.list(page.offset, page.limit, clientQuery(query));
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.clients.get(id); }

  @Post()
  create(@Body() value: unknown) { return this.clients.create(value); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() value: unknown) { return this.clients.update(id, value); }

  @Post(':id/change-scope') @HttpCode(200)
  changeScope(@Param('id') id: string, @Body() value: unknown) { return this.clients.changeScope(id, value); }

  @Post(':id/archive') @HttpCode(200)
  archive(@Param('id') id: string, @Body() value: unknown) { return this.clients.archive(id, value); }

  @Post(':id/reactivate') @HttpCode(200)
  reactivate(@Param('id') id: string, @Body() value: unknown) { return this.clients.reactivate(id, value); }

  @Put(':id/tags')
  setTags(@Param('id') id: string, @Body() value: unknown) { return this.clients.setTags(id, value); }

  @Delete(':id')
  remove(@Param('id') id: string, @Body() value: unknown) {
    this.clients.remove(id, value);
    return { id };
  }
}
