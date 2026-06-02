import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { dataSource } from './data-source';

/**
 * Bootstraps an admin user. Usage:
 *   bun run seed:admin                                      # admin@admin.com / admin
 *   bun run seed:admin you@example.com s3cret First Last    # custom
 *
 * Upsert semantics: if the user exists, the password is reset and the role is
 * raised to 'admin' (idempotent). Names are only filled when currently NULL.
 */
async function seedAdmin(): Promise<void> {
  const email = (process.argv[2] ?? 'admin@admin.com').toLowerCase().trim();
  const password = process.argv[3] ?? 'admin';
  const firstName = process.argv[4] ?? 'Admin';
  const lastName = process.argv[5] ?? 'User';

  await dataSource.initialize();
  try {
    const existing = await dataSource.query(`SELECT id FROM app_user WHERE email = $1`, [email]);
    const passwordHash = await bcrypt.hash(password, 10);

    if (existing.length > 0) {
      await dataSource.query(
        `UPDATE app_user
           SET password_hash = $1,
               role = 'admin',
               enabled = true,
               first_name = COALESCE(first_name, $2),
               last_name  = COALESCE(last_name,  $3)
         WHERE email = $4`,
        [passwordHash, firstName, lastName, email],
      );
      console.log(`updated existing user -> admin: ${email}`);
    } else {
      await dataSource.query(
        `INSERT INTO app_user (email, password_hash, first_name, last_name, enabled, role)
         VALUES ($1, $2, $3, $4, true, 'admin')`,
        [email, passwordHash, firstName, lastName],
      );
      console.log(`created admin user: ${email} (password: ${password})`);
    }
  } finally {
    await dataSource.destroy();
  }
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
