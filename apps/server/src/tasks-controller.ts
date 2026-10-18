import {
  ArgumentsHost, Body, Catch, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, UseFilters, type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, invalid, pagination } from '../../../packages/core/src/notes.ts';
import { taskQuery, type TasksRepository } from '../../../packages/core/src/tasks.ts';

export const TASKS_REPOSITORY = Symbol('tasks.repository');

const CONFLICT_REASONS: Record<string, string> = {
  REVISION_CONFLICT: 'REVISION_MISMATCH', PROJECT_CLOSED: 'PROJECT_CLOSED',
  PARENT_PROJECT_MISMATCH: 'PARENT_PROJECT_MISMATCH', PARENT_CLOSED: 'PARENT_CLOSED', HIERARCHY_CYCLE: 'HIERARCHY_CYCLE',
};

@Catch(DomainError)
class TaskErrors implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const reason = CONFLICT_REASONS[error.code];
    if (reason) response.status(409).json({ error: { code: 'CONFLICT', reason, message: error.message } });
    else response.status(error.code === 'NOT_FOUND' ? 404 : 400).json({ error: { code: error.code, message: error.message } });
  }
}

const LIST_PARAMETERS = ['offset', 'limit', 'projectId'];

/** Hierarchy has explicit commands; state, move and deletion remain separate future commands. */
@Controller('api/v1/tasks')
@UseFilters(TaskErrors)
export class TasksController {
  constructor(@Inject(TASKS_REPOSITORY) private readonly tasks: TasksRepository) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    if (Object.keys(query).some(key => !LIST_PARAMETERS.includes(key))) invalid('La consulta contiene parámetros no admitidos.');
    const page = pagination(query.offset, query.limit);
    return this.tasks.list(page.offset, page.limit, taskQuery(query));
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.tasks.get(id); }

  @Post()
  create(@Body() value: unknown) { return this.tasks.create(value); }

  @Post(':id/reparent')
  @HttpCode(200)
  reparent(@Param('id') id: string, @Body() value: unknown) { return this.tasks.reparent(id, value); }

  @Post(':id/detach')
  @HttpCode(200)
  detach(@Param('id') id: string, @Body() value: unknown) { return this.tasks.detach(id, value); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() value: unknown) { return this.tasks.update(id, value); }
}
