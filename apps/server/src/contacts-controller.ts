import {
  ArgumentsHost, Body, Catch, Controller, Get, HttpCode, Inject, Param, Patch, Post, Put,
  Query, UseFilters, type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { contactQuery, type ContactsRepository } from '../../../packages/core/src/contacts.ts';
import { DomainError, invalid, pagination } from '../../../packages/core/src/notes.ts';

export const CONTACTS_REPOSITORY = Symbol('contacts.repository');

/** Contact-only mapping; the global filter keeps Notes' REVISION_CONFLICT code untouched. */
@Catch(DomainError)
class ContactErrors implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error.code === 'REVISION_CONFLICT') {
      response.status(409).json({ error: { code: 'CONFLICT', reason: 'REVISION_MISMATCH', message: error.message } });
    } else {
      response.status(error.code === 'NOT_FOUND' ? 404 : 400).json({ error: { code: error.code, message: error.message } });
    }
  }
}

const LIST_PARAMETERS = ['offset', 'limit', 'scope', 'archived', 'q', 'tagIds', 'tagMode'];

/** Deliberately no DELETE: contacts are archived, never removed individually. */
@Controller('api/v1/contacts')
@UseFilters(ContactErrors)
export class ContactsController {
  constructor(@Inject(CONTACTS_REPOSITORY) private readonly contacts: ContactsRepository) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    if (Object.keys(query).some(key => !LIST_PARAMETERS.includes(key))) invalid('La consulta contiene parámetros no admitidos.');
    const page = pagination(query.offset, query.limit);
    return this.contacts.list(page.offset, page.limit, contactQuery(query));
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.contacts.get(id); }

  @Post()
  create(@Body() value: unknown) { return this.contacts.create(value); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() value: unknown) { return this.contacts.update(id, value); }

  @Post(':id/archive') @HttpCode(200)
  archive(@Param('id') id: string, @Body() value: unknown) { return this.contacts.archive(id, value); }

  @Post(':id/reactivate') @HttpCode(200)
  reactivate(@Param('id') id: string, @Body() value: unknown) { return this.contacts.reactivate(id, value); }

  @Put(':id/clients')
  setClients(@Param('id') id: string, @Body() value: unknown) { return this.contacts.setClients(id, value); }

  @Put(':id/tags')
  setTags(@Param('id') id: string, @Body() value: unknown) { return this.contacts.setTags(id, value); }
}
