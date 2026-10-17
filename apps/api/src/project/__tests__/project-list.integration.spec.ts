import 'reflect-metadata';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { ProjectService } from '../project.service';

/**
 * Real-Postgres regression test for ProjectService.list(). The unit spec mocks
 * `dataSource.query`, so it never saw that the 'all' filter matched no SQL
 * branch and returned an empty list. Runs every migration against a disposable
 * testcontainer, never against a shared database.
 *
 * Only list() is exercised and it uses nothing but the DataSource, so the
 * repositories and access service are stubbed.
 */
jest.setTimeout(180_000);

describe('ProjectService.list (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let service: ProjectService;
  let alice: string;
  let bob: string;

  const codes = async (userId: string, filter?: 'all' | 'mine' | 'shared'): Promise<string[]> =>
    (await service.list(userId, filter)).map((p) => p.code).sort();

  const insertProject = async (ownerId: string, code: string): Promise<string> => {
    const [project] = await dataSource.query(
      `INSERT INTO project (owner_id, code, name) VALUES ($1, $2, $2) RETURNING id`,
      [ownerId, code],
    );
    await dataSource.query(
      `INSERT INTO project_member (project_id, user_id, role) VALUES ($1, $2, 'OWNER')`,
      [project.id, ownerId],
    );
    return project.id;
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource({
      type: 'postgres',
      url: container.getConnectionUri(),
      entities: [],
      migrations: [join(__dirname, '..', '..', 'db', 'migrations', '*.{ts,js}')],
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();

    const [a] = await dataSource.query(
      `INSERT INTO app_user (email, password_hash) VALUES ('alice@example.com', 'x') RETURNING id`,
    );
    const [b] = await dataSource.query(
      `INSERT INTO app_user (email, password_hash) VALUES ('bob@example.com', 'x') RETURNING id`,
    );
    alice = a.id;
    bob = b.id;

    await insertProject(alice, 'ALICE-OWN');
    const bobsProject = await insertProject(bob, 'BOB-SHARED');
    await dataSource.query(
      `INSERT INTO project_member (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [bobsProject, alice],
    );
    // Bob's private project: Alice is not a member, so she must never see it.
    await insertProject(bob, 'BOB-PRIVATE');
    // A soft-deleted project Alice owns must stay hidden under every filter.
    const deleted = await insertProject(alice, 'ALICE-DELETED');
    await dataSource.query(`UPDATE project SET deleted_at = now() WHERE id = $1`, [deleted]);

    service = new ProjectService({} as never, {} as never, {} as never, dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await container.stop();
  });

  it("'all' returns owned and shared projects, same as no filter", async () => {
    expect(await codes(alice, 'all')).toEqual(['ALICE-OWN', 'BOB-SHARED']);
    expect(await codes(alice)).toEqual(['ALICE-OWN', 'BOB-SHARED']);
  });

  it("'mine' returns only projects the user owns", async () => {
    expect(await codes(alice, 'mine')).toEqual(['ALICE-OWN']);
  });

  it("'shared' returns only projects owned by someone else", async () => {
    expect(await codes(alice, 'shared')).toEqual(['BOB-SHARED']);
  });

  it("'all' from the other side includes the private project and the shared one", async () => {
    expect(await codes(bob, 'all')).toEqual(['BOB-PRIVATE', 'BOB-SHARED']);
  });

  it('never leaks a project the user is not a member of', async () => {
    expect(await codes(alice, 'all')).not.toContain('BOB-PRIVATE');
  });
});
