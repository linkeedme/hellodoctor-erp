# Pendências abertas ao fim da Fatia 1 (Fase 0)

Levantadas nos reviews da fatia 1 e deliberadamente adiadas. Nenhuma é bug hoje; todas são armadilhas para quem vier depois.

## Bloqueiam a Fatia 2

**1. Helper `comClinicaDaSessao(fn)`** — *é o item nº 1 da Fatia 2.*

Hoje `comClinica({ clinicaId, usuarioId }, fn)` recebe dois textos soltos. Nada no compilador força que venham do mesmo objeto `SessaoAtiva`. Um call-site pode escrever `comClinica({ clinicaId: sessao.clinicaId, usuarioId: outraCoisa }, ...)` e o TypeScript aprova.

Não foi construído nesta fatia porque não existe nenhum call-site ainda, e desenhar a assinatura sem consumidor seria chute (leitura versus escrita, com versus sem transação). **A primeira Server Action de domínio da Fatia 2 deve nascer junto com esse helper**, e nenhum call-site deve montar `ContextoRequest` à mão.

## Bloqueiam o primeiro deploy

**2. Role dedicado com `BYPASSRLS`** — *entra no "pronto para deploy", não é nota de rodapé.*

`DATABASE_URL_SERVICO` aponta hoje para o superusuário do Postgres, que ignora RLS por ser superusuário. **No Supabase gerenciado não existe superusuário.** Como criar uma clínica nova precisa ignorar o RLS (não há `clinica_id` para setar antes de a clínica existir), o onboarding de tenant (ADM-01 / RF-012) **quebra em produção** sem um role real com `BYPASSRLS` criado antes.

## Podem esperar

**3. Cobertura de integração da sessão.** `obterSessao`, `exigirSessao` e `definirClinicaAtiva` não têm teste ponta a ponta — só as regras puras extraídas (`validarClinicaDisponivel`, `escolherClinicaAtiva`) são testadas. Depende de Supabase CLI local ou de um dublê injetável de `clienteSupabaseServidor`.

**4. `barreira-server-only.test.ts` não cobre os três arquivos de `lib/auth/`.** Eles estão corretos hoje, mas nada trava isso além do lint e do build.

**5. Dois warnings de `import/no-anonymous-default-export`** em `eslint.config.mjs` e na regra de lint. Custo zero de corrigir.

**6. Lista de `--ignore-pattern` no script `lint` com cinco entradas.** Cresce a cada fixture negativa. Auto-corretiva (a sexta esquecida quebra o lint ruidosamente), mas sugere-se mover as fixtures para `tests/lint/fixtures/negativas/` e usar um glob único.

**7. Helper genérico `comoClinica<T>` em `tests/rls-smoke/isolamento.test.ts`** resolve para `never` — tipagem de fachada, inofensiva.

**8. `db/seed/usuario-dev.ts` usa clínica e CNPJ fixos.** Colide se dois desenvolvedores compartilharem o mesmo banco. Aceitável em ambiente individual.

---

## Método a repetir

Depois que os testes passarem, perguntar: **"se eu quebrasse a regra que este teste protege, ele falharia?"** — e exigir a resposta por sabotagem real, não por opinião.

Na Fatia 1 essa pergunta expôs, com os testes verdes nos três casos:
- a regra de lint cobria 1 de 12 casos de bypass;
- 3 de 4 asserções de isolamento passavam com o `set_config` sabotado;
- a validação que impede cookie forjado de ativar clínica alheia não tinha teste nenhum.
