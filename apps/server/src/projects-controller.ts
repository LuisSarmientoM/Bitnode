import {
  ArgumentsHost, Body, Catch, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put,
  Query, UseFilters, type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { projectQuery, type ProjectsRepository } from '../../../packages/core/src/projects.ts';
import { DomainError, invalid, pagination } from '../../../packages/core/src/notes.ts';

export const PROJECTS_REPOSITORY = Symbol('projects.repository');

const CONFLICT_REASONS: Record<string, string> = {
  REVISION_CONFLICT: 'REVISION_MISMATCH', DUPLICATE_NAME: 'DUPLICATE_NAME',
  HAS_ASSOCIATIONS: 'HAS_ASSOCIATIONS', CLIENT_ARCHIVED: 'CLIENT_ARCHIVED',
};

/** Project-only mapping, like clients: domain conflicts become CONFLICT with a reason. */
@Catch(DomainError)
class ProjectErrors implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const reason = CONFLICT_REASONS[error.code];
    if (reason) response.status(409).json({ error: { code: 'CONFLICT', reason, message: error.message } });
    else response.status(error.code === 'NOT_FOUND' ? 404 : 400).json({ error: { code: error.code, message: error.message } });
  }
}

const LIST_PARAMETERS = ['offset', 'limit', 'state', 'clientId', 'archived', 'q'];

@Controller('api/v1/projects')
@UseFilters(ProjectErrors)
export class ProjectsController {
  constructor(@Inject(PROJECTS_REPOSITORY) private readonly projects: ProjectsRepository) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    if (Object.keys(query).some(key => !LIST_PARAMETERS.includes(key))) invalid('La consulta contiene parámetros no admitidos.');
    const page = pagination(query.offset, query.limit);
    return this.projects.list(page.offset, page.limit, projectQuery(query));
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.projects.get(id); }

  @Post()
  create(@Body() value: unknown) { return this.projects.create(value); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() value: unknown) { return this.projects.update(id, value); }

  @Post(':id/change-state') @HttpCode(200)
  changeState(@Param('id') id: string, @Body() value: unknown) { return this.projects.changeState(id, value); }

  @Put(':id/tags')
  setTags(@Param('id') id: string, @Body() value: unknown) { return this.projects.setTags(id, value); }

  @Delete(':id')
  remove(@Param('id') id: string, @Body() value: unknown) {
    this.projects.remove(id, value);
    return { id };
  }
}
