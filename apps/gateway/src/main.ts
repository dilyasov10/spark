import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SWAGGER_PATH, setupApp, setupSwagger } from '@app/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Префикс — до Swagger: иначе он соберёт спеку по путям без `/api`.
  setupApp(app);
  setupSwagger(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  Logger.log(`Swagger: http://localhost:${port}/${SWAGGER_PATH}`, 'Bootstrap');
}
bootstrap();
