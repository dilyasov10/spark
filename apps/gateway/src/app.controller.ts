import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'Проверка живости сервиса',
    description:
      'Отвечает 200, пока процесс жив. Сюда ходят readiness- и liveness-пробы ' +
      'Kubernetes (apps/gateway/deployment.yaml); состояние базы и брокера ' +
      'эндпоинт не проверяет. Фронтенду не нужен.',
  })
  @ApiOkResponse({
    description: 'Сервис отвечает',
    schema: { type: 'string', example: 'Hello World!' },
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
