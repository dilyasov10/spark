import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { setupApp } from './../src/common/bootstrap/setup-app';
import { PrismaService } from './../src/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    // Проверяются маршруты, к базе не обращающиеся, а настоящий PrismaService
    // требует DATABASE_URL и открывает соединение на старте модуля. Подменяем
    // его заглушкой — тогда прогон не зависит от доступности БД.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('отвечает 404 на корень без префикса', () => {
    return request(app.getHttpServer()).get('/').expect(404);
  });
});
