import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request = require('supertest');
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { NoteController } from '../note/note.controller';
import { NoteService } from '../note/note.service';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { UserDto } from '../user/user.dto';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { IdempotencyKey } from '../common/idempotency-key.entity';
import { ResponseInterceptor } from '../common/response.interceptor';
import { GlobalExceptionFilter } from '../common/global-exception.filter';
import { Item } from '../item/item.entity';
import { ItemOccurrence } from '../item/item-occurrence.entity';
import { Note } from '../note/note.entity';
import { NoteTag } from '../note/note-tag.entity';
import { Project } from '../project/project.entity';
import { Goal } from '../goal/goal.entity';

/**
 * Generates the JSON fixtures the macOS client decodes (apps/macos/Sources/HusrevityTestSupport/Fixtures). The bodies
 * come out of the real controllers, ResponseInterceptor and GlobalExceptionFilter running against
 * a disposable Postgres, so a contract change shows up as a Swift decode failure.
 *
 * Opt-in because it rewrites files:  WRITE_FIXTURES=1 bun run test -- src/sync/fixtures.integration
 */
const ENABLED = process.env.WRITE_FIXTURES === '1';
const OUT_DIR = join(__dirname, '..', '..', '..', 'macos', 'Sources', 'HusrevityTestSupport', 'Fixtures');

jest.setTimeout(180_000);

(ENABLED ? describe : describe.skip)('macOS client fixtures', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let userId: string;

  const write = (name: string, body: unknown) => {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, name), JSON.stringify(body, null, 2) + '\n');
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
      migrations: [join(__dirname, '..', 'db', 'migrations', '*.{ts,js}')],
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
    const [u] = await dataSource.query(
      `INSERT INTO app_user (email, password_hash, first_name, last_name)
       VALUES ('fixture@example.com', 'x', 'Fixture', 'User') RETURNING id`,
    );
    userId = u.id;

    const repo = <T extends object>(e: new () => T) => dataSource.getRepository(e);
    const authService = {
      login: async () => ({
        accessToken: 'fixture-access-token',
        refreshToken: 'fixture-refresh-token',
        user: UserDto.from(
          (await dataSource.getRepository('User').findOneByOrFail({ id: userId })) as never,
        ),
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SyncController, NoteController, AuthController],
      providers: [
        SyncService,
        NoteService,
        IdempotencyInterceptor,
        { provide: AuthService, useValue: authService },
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Item), useValue: repo(Item) },
        { provide: getRepositoryToken(ItemOccurrence), useValue: repo(ItemOccurrence) },
        { provide: getRepositoryToken(Note), useValue: repo(Note) },
        { provide: getRepositoryToken(NoteTag), useValue: repo(NoteTag) },
        { provide: getRepositoryToken(Project), useValue: repo(Project) },
        { provide: getRepositoryToken(Goal), useValue: repo(Goal) },
        { provide: getRepositoryToken(IdempotencyKey), useValue: repo(IdempotencyKey) },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.use((req: any, _res: unknown, next: () => void) => {
      req.user = { userId, email: 'fixture@example.com', role: 'ROLE_USER' };
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  it('writes the sync, write and auth fixtures', async () => {
    const http = request(app.getHttpServer());

    // Seed one row of every synced kind, including a recurring item with a completed occurrence.
    const tag = await http.post('/api/note-tags').send({ name: 'work', color: '#3366ff' });
    const note = await http
      .post('/api/notes')
      .send({ title: 'Plan the week', bodyMarkdown: '# Plan\n- ship sync', tagIds: [tag.body.data.id] });
    const items = dataSource.getRepository(Item);
    const recurring = await items.save(
      items.create({
        ownerId: userId,
        kind: 'task',
        title: 'Run',
        status: 'open',
        payload: {},
        rrule: 'FREQ=DAILY',
        scheduledAt: new Date('2026-02-01T05:00:00Z'),
        durationMin: 30,
        notifyMinutesBefore: 10,
      }),
    );
    const oneOff = await items.save(
      items.create({ ownerId: userId, kind: 'task', title: 'Pay rent', status: 'open', payload: {} }),
    );
    const occurrences = dataSource.getRepository(ItemOccurrence);
    const occurrence = await occurrences.save(
      occurrences.create({
        itemId: recurring.id,
        ownerId: userId,
        occursOn: '2026-02-03',
        status: 'done',
        completedAt: new Date('2026-02-03T05:40:00Z'),
      }),
    );
    await dataSource
      .getRepository(Project)
      .save(dataSource.getRepository(Project).create({ ownerId: userId, code: 'HOME', name: 'Home' }));
    const goal = await dataSource.getRepository(Goal).save(
      dataSource.getRepository(Goal).create({
        ownerId: userId,
        title: 'Ship the Mac app',
        horizon: 'month',
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
        status: 'active',
      }),
    );

    const full = await http.get('/api/sync').expect(200);
    write('sync-full.json', full.body);

    // Mutate every kind after the cursor: edit, soft delete, tag delete (touches the note).
    await sleep(20);
    const cursor = full.body.data.cursor as string;
    const noteBefore = await http.get(`/api/notes/${note.body.data.id}`);
    const updatedAtMs = new Date(noteBefore.body.data.updatedAt).getTime();
    const updated = await http
      .put(`/api/notes/${note.body.data.id}`)
      .set('If-Match', String(updatedAtMs))
      .send({ title: 'Plan the week (v2)', bodyMarkdown: '# Plan\n- ship sync', tagIds: [tag.body.data.id] })
      .expect(200);
    write('note-updated.json', updated.body);

    await http.delete(`/api/note-tags/${tag.body.data.id}`).expect(204);
    await items.softRemove(oneOff);
    await occurrences.softRemove(occurrence);
    goal.title = 'Ship the Mac app (v1)';
    await dataSource.getRepository(Goal).save(goal);

    const incremental = await http.get('/api/sync').query({ since: cursor }).expect(200);
    write('sync-incremental.json', incremental.body);

    // Writes an offline client replays: stale If-Match → 409, idempotent create → same body.
    const stale = await http
      .put(`/api/notes/${note.body.data.id}`)
      .set('If-Match', String(updatedAtMs))
      .send({ title: 'Stale write', bodyMarkdown: '', tagIds: [] })
      .expect(409);
    write('note-409.json', stale.body);

    const created = await http
      .post('/api/notes')
      .set('Idempotency-Key', 'fixture-key-1')
      .send({ title: 'Created offline', bodyMarkdown: 'body', tagIds: [] })
      .expect(201);
    const replay = await http
      .post('/api/notes')
      .set('Idempotency-Key', 'fixture-key-1')
      .send({ title: 'Created offline', bodyMarkdown: 'body', tagIds: [] })
      .expect(201);
    expect(replay.body.data.id).toBe(created.body.data.id);
    write('note-created.json', created.body);

    const login = await http.post('/api/auth/login').send({ email: 'fixture@example.com', password: 'x' });
    write('login.json', login.body);

    expect(full.body.data.items).toHaveLength(2);
    expect(incremental.body.data.tombstones.items).toEqual([oneOff.id]);
    expect(incremental.body.data.tombstones.itemOccurrences).toEqual([occurrence.id]);
    expect(incremental.body.data.tombstones.noteTags).toEqual([tag.body.data.id]);
    expect(incremental.body.data.notes.map((n: { id: string }) => n.id)).toEqual([note.body.data.id]);
  });
});
