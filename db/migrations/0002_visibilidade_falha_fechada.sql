-- 0002_visibilidade_falha_fechada.sql
--
-- Dois defeitos em app_paciente_visivel, encontrados na revisão da fatia 3:
--
-- 1. Falha ABERTA: clínica sem linha em politica_visibilidade_paciente tinha
--    todos os pacientes visíveis a todos. Uma linha apagada por acidente
--    reabria uma clínica configurada como 'isolado', em silêncio. Todo o
--    resto do projeto falha fechado; esta era a exceção.
--
-- 2. security definer sem search_path fixo: vetor clássico de escalada em
--    função que decide quem lê prontuário.
--
-- A garantia primária continua sendo o onboarding criar a linha de política.
-- Esta mudança é a rede: se a linha sumir, a clínica perde acesso e reclama
-- na hora, em vez de vazar em silêncio.

create or replace function app_paciente_visivel(
  p_paciente_id uuid,
  p_escopo text default 'clinico'
)
returns boolean as $$
declare
  v_modo modo_visibilidade_paciente;
  v_responsavel_id uuid;
  v_profissional_id uuid;
begin
  select modo into v_modo
  from politica_visibilidade_paciente
  where clinica_id = app_clinica_id();

  -- falha fechada: sem política configurada, ninguém vê
  if v_modo is null then
    return false;
  end if;

  if v_modo = 'aberto' then
    return true;
  end if;

  select profissional_responsavel_id into v_responsavel_id
  from paciente where id = p_paciente_id;

  select p.id into v_profissional_id
  from profissional p
  join membro m on m.id = p.membro_id
  where m.usuario_id = app_usuario_id() and m.clinica_id = app_clinica_id();

  if v_modo = 'restrito' and p_escopo = 'agenda_financeiro' then
    return true; -- agenda/financeiro abertos à gestão; RBAC decide quem é "gestão"
  end if;

  if v_profissional_id is not null and v_profissional_id = v_responsavel_id then
    return true;
  end if;

  return exists (
    select 1 from paciente_acesso_autorizado
    where paciente_id = p_paciente_id and profissional_id = v_profissional_id
  );
end;
$$ language plpgsql stable security definer set search_path = public, pg_temp;
