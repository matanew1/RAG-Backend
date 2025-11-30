import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';

@Catch()
export class WsExceptionFilter<T> implements ExceptionFilter {
  catch(exception: T, host: ArgumentsHost) {}
}
