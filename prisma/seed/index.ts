import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { describeTarget, resolveConnectionString } from './connection';
import { assertLocalEnvironment } from './guard';
import { SEED_POSTS } from './posts';
import { SEED_USERS } from './users';

/** Общий пароль для всех фиктивных аккаунтов, задокументирован в README. */
const SEED_PASSWORD = 'Password123!';
const BCRYPT_ROUNDS = 10;

/**
 * Дефолтные 2 секунды на старт транзакции малы для Neon: инстанс может
 * просыпаться из спящего режима, а до него ещё и сетевая задержка.
 */
const TRANSACTION_MAX_WAIT_MS = 30_000;
const TRANSACTION_TIMEOUT_MS = 120_000;

async function seed(): Promise<void> {
  assertLocalEnvironment();

  const connectionString = resolveConnectionString();
  console.info(`Сид данных → ${describeTarget(connectionString)}`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    // Соединение поднимаем до транзакции, чтобы пробуждение Neon не съедало
    // отведённое ей время ожидания.
    await prisma.$connect();

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

    // Одна транзакция: либо весь набор, либо база остаётся как была.
    // Пользователи идут первыми — посты ссылаются на них по authorId.
    await prisma.$transaction(
      async (tx) => {
        for (const user of SEED_USERS) {
          const data = { ...user, passwordHash };
          await tx.user.upsert({
            where: { id: user.id },
            create: data,
            update: data,
          });
        }

        for (const post of SEED_POSTS) {
          await tx.post.upsert({
            where: { id: post.id },
            create: post,
            update: post,
          });
        }
      },
      {
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    );

    const [userCount, postCount] = await Promise.all([
      prisma.user.count(),
      prisma.post.count(),
    ]);

    console.info(
      `Готово: пользователей ${userCount}, постов ${postCount} (записано ${SEED_USERS.length} и ${SEED_POSTS.length}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error(
    `Сид данных не выполнен: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
