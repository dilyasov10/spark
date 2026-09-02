/**
 * Идентификаторы зафиксированы в коде: сид работает через upsert по id,
 * поэтому повторный запуск обновляет те же строки, а не плодит дубликаты.
 */
export const SEED_USER_IDS = {
  anna: '3f8c1a94-2e7b-4d61-9c0a-5b1e2d4a7f01',
  dmitry: '7a2d5e18-9c34-4b6f-8e2d-1f7a3c9b5d02',
  marina: 'c41b7f26-8d05-4a93-b7e1-6c2f9a3d8e03',
  ilya: '9e5a3b72-1f48-4c07-a5d9-3b8e1c6f2a04',
  sofia: '2d6f9c41-5b83-4e27-9a1c-7d4b2e8f3c05',
  timur: '8b3e7d05-4a19-42f6-8c7b-9e1d5a2c4b06',
  elena: '5c9a2e63-7d41-4f18-b3e9-2a6c8d1f7e07',
  artem: 'e17b4d92-3c68-4a25-9f1d-8b5e3c7a2d08',
} as const;

export interface SeedUser {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Seed-аккаунты сразу подтверждены — ими можно логиниться без confirmation-flow. */
  readonly isConfirmed: true;
  readonly createdAt: Date;
}

export const SEED_USERS: readonly SeedUser[] = [
  {
    id: SEED_USER_IDS.anna,
    username: 'anna_kovaleva',
    email: 'anna.kovaleva@gmail.com',
    firstName: 'Анна',
    lastName: 'Ковалёва',
    isConfirmed: true,
    createdAt: new Date('2026-01-17T08:42:00Z'),
  },
  {
    id: SEED_USER_IDS.dmitry,
    username: 'dmitry_sokolov',
    email: 'd.sokolov@yandex.ru',
    firstName: 'Дмитрий',
    lastName: 'Соколов',
    isConfirmed: true,
    createdAt: new Date('2026-01-23T14:05:00Z'),
  },
  {
    id: SEED_USER_IDS.marina,
    username: 'marina.belova',
    email: 'marina.belova@outlook.com',
    firstName: 'Марина',
    lastName: 'Белова',
    isConfirmed: true,
    createdAt: new Date('2026-02-04T19:30:00Z'),
  },
  {
    id: SEED_USER_IDS.ilya,
    username: 'ilya_ershov',
    email: 'ilya.ershov@gmail.com',
    firstName: 'Илья',
    lastName: 'Ершов',
    isConfirmed: true,
    createdAt: new Date('2026-02-11T07:15:00Z'),
  },
  {
    id: SEED_USER_IDS.sofia,
    username: 'sofia_nikitina',
    email: 'sofia.nikitina@mail.ru',
    firstName: 'София',
    lastName: 'Никитина',
    isConfirmed: true,
    createdAt: new Date('2026-02-28T11:50:00Z'),
  },
  {
    id: SEED_USER_IDS.timur,
    username: 'timur_ashirov',
    email: 'timur.ashirov@gmail.com',
    firstName: 'Тимур',
    lastName: 'Аширов',
    isConfirmed: true,
    createdAt: new Date('2026-03-09T06:20:00Z'),
  },
  {
    id: SEED_USER_IDS.elena,
    username: 'elena_voronova',
    email: 'elena.voronova@proton.me',
    firstName: 'Елена',
    lastName: 'Воронова',
    isConfirmed: true,
    createdAt: new Date('2026-03-21T16:44:00Z'),
  },
  {
    id: SEED_USER_IDS.artem,
    username: 'artem_lebedev',
    email: 'artem.lebedev@gmail.com',
    firstName: 'Артём',
    lastName: 'Лебедев',
    isConfirmed: true,
    createdAt: new Date('2026-04-02T21:10:00Z'),
  },
];
