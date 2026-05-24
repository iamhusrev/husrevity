import * as bcrypt from 'bcrypt';

const password = process.argv[2];
if (!password) {
  console.error('Usage: bun scripts/hash-password.ts <password>');
  process.exit(1);
}
console.log(bcrypt.hashSync(password, 10));
