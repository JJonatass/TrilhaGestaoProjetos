// Testa o limite de integrantes por equipe (migração 0007) num Postgres em memória.
// Uso: npm i -D @electric-sql/pglite && node supabase/tests/limite.test.mjs

import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
const M = new URL('../migrations/', import.meta.url).pathname
const db = new PGlite()
let falhas = 0
const ok = (c, m) => {
  if (!c) falhas++
  console.log(c ? '  ✓' : '  ✗ FALHOU:', m)
}

await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}', last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
create publication supabase_realtime;
`)
for (const f of ['0001_schema.sql', '0002_sample_project.sql', '0003_admin.sql', '0004_convites_e_permissoes.sql', '0005_prazo_e_drive.sql', '0007_limite_equipe.sql']) {
  await db.exec(readFileSync(M + f, 'utf8'))
}

const users = {}
for (const k of ['A', 'B', 'C', 'D', 'E']) {
  const email = `${k.toLowerCase()}@ex.com`
  const r = await db.query(`insert into auth.users(email, email_confirmed_at) values ($1, now()) returning id`, [email])
  users[k] = { id: r.rows[0].id, email }
}
const rj = await db.query(`insert into auth.users(email, email_confirmed_at) values ('jonatas.junior@gmail.com', now()) returning id`)
users.J = { id: rj.rows[0].id, email: 'jonatas.junior@gmail.com' }

async function as(k, sql, params = []) {
  const u = users[k]
  await db.exec(`reset role;`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [u.id, JSON.stringify({ sub: u.id, email: u.email, role: 'authenticated' })])
  await db.exec(`set role authenticated;`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role;') }
}
async function err(k, sql, params = []) { try { await as(k, sql, params); return null } catch (e) { return e.message } }

console.log('Limite de integrantes')
// sem limite: comportamento antigo
const p = (await as('A', `insert into projects(name) values ('Equipe A') returning id, max_members`)).rows[0]
ok(p.max_members === null, 'projeto novo sem padrão fica sem limite')

// aluno não consegue definir o próprio limite
await as('A', `update projects set max_members = 50 where id = $1`, [p.id])
ok((await as('A', `select max_members from projects where id=$1`, [p.id])).rows[0].max_members === null, 'aluno não altera o limite (o banco ignora)')
ok(await err('A', `select admin_set_max_members(null, 3)`), 'aluno não usa a função do admin')
ok(await err('A', `select team_seats_used($1)`, [p.id]), 'contagem interna não fica exposta na API')

// admin define 3 vagas
ok((await as('J', `select admin_set_max_members(array[$1]::uuid[], 3) n`, [p.id])).rows[0].n === 1, 'admin define limite 3 para o projeto')
await as('A', `insert into project_invites(project_id,email,role) values ($1,'b@ex.com','editor')`, [p.id])
await as('A', `insert into project_invites(project_id,email,role) values ($1,'c@ex.com','editor')`, [p.id])
const e1 = await err('A', `insert into project_invites(project_id,email,role) values ($1,'d@ex.com','editor')`, [p.id])
ok(e1 && e1.includes('limite de 3'), 'quarto convite é barrado (dono + 2 convites pendentes = 3): ' + e1)

// aceitar convite continua funcionando dentro do limite
const invB = (await as('B', `select id from my_invites()`)).rows[0].id
ok(!(await err('B', `select accept_invite($1)`, [invB])), 'convidado aceita dentro do limite')
const invC = (await as('C', `select id from my_invites()`)).rows[0].id
ok(!(await err('C', `select accept_invite($1)`, [invC])), 'segundo convidado também entra (equipe cheia: 3)')
ok((await as('A', `select count(*)::int n from project_members where project_id=$1`, [p.id])).rows[0].n === 3, 'equipe com 3 integrantes')

// alguém sai: abre vaga
await as('C', `delete from project_members where project_id=$1 and user_id=$2`, [p.id, users.C.id])
ok(!(await err('A', `insert into project_invites(project_id,email,role) values ($1,'d@ex.com','viewer')`, [p.id])), 'quando alguém sai, abre vaga para novo convite')

// baixar o limite não remove ninguém, mas trava a entrada pendente
await as('J', `select admin_set_max_members(array[$1]::uuid[], 2)`, [p.id])
ok((await as('A', `select count(*)::int n from project_members where project_id=$1`, [p.id])).rows[0].n === 2, 'baixar o limite não remove integrantes')
const invD = (await as('D', `select id from my_invites()`)).rows[0].id
const e2 = await err('D', `select accept_invite($1)`, [invD])
ok(e2 && e2.includes('limite de 2'), 'convite antigo não entra se a equipe já está no novo limite: ' + e2)

// remover limite
await as('J', `select admin_set_max_members(null, null)`)
ok(!(await err('D', `select accept_invite($1)`, [invD])), 'sem limite, o convite pendente entra')

// padrão para novos projetos
await as('J', `select admin_set_default_max_members(4)`)
const p2 = (await as('E', `insert into projects(name) values ('Equipe E') returning max_members`)).rows[0]
ok(p2.max_members === 4, 'padrão do admin vale para projetos novos')
const v3 = (await as('J', `select name, members, max_members, pending_invites from admin_projects_v3() order by name`)).rows
ok(v3.length === 2 && v3[0].members === 3 && v3[0].max_members === null && v3[1].max_members === 4, 'visão do admin mostra integrantes e limite')
ok(await err('A', `select * from admin_projects_v3()`), 'aluno não vê a visão do admin')
ok(await err('A', `select admin_set_default_max_members(10)`), 'aluno não muda o padrão')
const e3 = await err('J', `select admin_set_max_members(null, 0)`)
ok(e3, 'limite precisa ser pelo menos 1')

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo')
process.exit(falhas ? 1 : 0)
