import {
  ArgumentsHost, Body, Catch, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, UseFilters, type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, invalid, pagination } from '../../../packages/core/src/notes.ts';
import { TaskConfirmationError, taskQuery, type TasksRepository } from '../../../packages/core/src/tasks.ts';

export const TASKS_REPOSITORY = Symbol('tasks.repository');

const CONFLICT_REASONS: Record<string, string> = {
  REVISION_CONFLICT: 'REVISION_MISMATCH', PROJECT_CLOSED: 'PROJECT_CLOSED',
  OPEN_DESCENDANTS: 'OPEN_DESCENDANTS', REOPEN_REQUIRED: 'REOPEN_REQUIRED',
  TASK_NOT_CLOSED: 'TASK_NOT_CLOSED', CLIENT_ARCHIVED: 'CLIENT_ARCHIVED',
  PARENT_PROJECT_MISMATCH: 'PARENT_PROJECT_MISMATCH', PARENT_CLOSED: 'PARENT_CLOSED', HIERARCHY_CYCLE: 'HIERARCHY_CYCLE',
};

@Catch(DomainError)
class TaskErrors implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    // Same body as the client scope change: CONFIRMATION_REQUIRED has no reason; PREVIEW_CHANGED is a CONFLICT with a fresh preview.
    if (error instanceof TaskConfirmationError) {
      const body = error.code === 'PREVIEW_CHANGED' ? { code: 'CONFLICT', reason: 'PREVIEW_CHANGED' } : { code: error.code };
      response.status(409).json({ error: { ...body, message: error.message, preview: error.preview } });
      return;
    }
    const reason = CONFLICT_REASONS[error.code];
    if (reason) response.status(409).json({ error: { code: 'CONFLICT', reason, message: error.message } });
    else response.status(error.code === 'NOT_FOUND' ? 404 : 400).json({ error: { code: error.code, message: error.message } });
  }
}

const LIST_PARAMETERS = ['offset', 'limit', 'projectId', 'roots', 'parentId'];

/** Hierarchy, state, cancel and reopen have explicit commands; move and deletion remain future commands. */
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

  @Post(':id/change-state')
  @HttpCode(200)
  changeState(@Param('id') id: string, @Body() value: unknown) { return this.tasks.changeState(id, value); }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() value: unknown) { return this.tasks.cancel(id, value); }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@Param('id') id: string, @Body() value: unknown) { return this.tasks.reopen(id, value); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() value: unknown) { return this.tasks.update(id, value); }
}
