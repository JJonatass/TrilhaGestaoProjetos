-- Administrador do sistema (entra em vigor quando este e-mail confirmar o cadastro).
-- Para trocar ou incluir outro admin, edite e rode novamente.
insert into public.app_admins (email) values ('jonatas.junior@gmail.com')
on conflict do nothing;
