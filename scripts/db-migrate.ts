import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL_SERVICO;
if (!url) throw new Error("DATABASE_URL_SERVICO não definida");

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();

await cliente.query(`
  create table if not exists migracao_aplicada (
    nome text primary key,
    aplicada_em timestamptz not null default now()
  )
`);

const dir = join(process.cwd(), "db", "migrations");
const arquivos = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

for (const arquivo of arquivos) {
  const { rowCount } = await cliente.query(
    "select 1 from migracao_aplicada where nome = $1",
    [arquivo],
  );
  if (rowCount && rowCount > 0) {
    console.log(`· ${arquivo} (já aplicada)`);
    continue;
  }

  const sql = await readFile(join(dir, arquivo), "utf8");
  await cliente.query("begin");
  try {
    await cliente.query(sql);
    await cliente.query("insert into migracao_aplicada (nome) values ($1)", [arquivo]);
    await cliente.query("commit");
    console.log(`✓ ${arquivo}`);
  } catch (erro) {
    await cliente.query("rollback");
    console.error(`✗ ${arquivo}`);
    throw erro;
  }
}

await cliente.end();
