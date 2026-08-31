# Hello Doctor — Design System

**Sistema visual:** adoção deliberada da linguagem do Amigo Clinic, identidade própria
**Data:** 2026-08-30 (revisão 2 — reconstrução total)
**Autor:** Prisma (designer de produto)
**Referência canônica:** `docs/superpowers/specs/2026-08-30-hello-doctor-arquitetura-design.md`
**Companion navegável:** `docs/style-guide.html`

> **Nota sobre a revisão 1:** a primeira versão deste documento inventou uma direção visual própria ("Precisão Editorial"). Foi rejeitada — o pedido nunca foi para inventar, foi para **replicar a linguagem visual do Amigo Clinic** (amigotech.com.br/produtos/amigo-clinic), o concorrente direto, com valores exatos extraídos do site. Esta revisão parte do zero sobre essa base.

---

## 1. Direção visual — o que é e o que não é

**O que fazemos:** copiamos a linguagem visual do Amigo Clinic — paleta, tipografia, forma, densidade, os padrões de componente (sidebar de ícones, card de agendamento com barra lateral, pill com ponto colorido, ícone em quadrado arredondado). É o vocabulário visual do produto líder do nicho, e replicá-lo com fidelidade é a decisão, não um ponto de partida para reinterpretar.

**O que não fazemos:** não copiamos logo, nome, ilustração ou texto do Amigo. O Hello Doctor tem nome e marca próprios — um selo (quadrado arredondado azul com um traço de pulso, ver `style-guide.html`) e o wordmark "Hello Doctor" em Inter 500 — construídos dentro do mesmo vocabulário de forma e cor, nunca copiados do concorrente.

**Por que isso não é preguiça de design:** um SaaS vertical de nicho pequeno (clínica de estética) compete por confiança operacional, não por diferenciação estética. Quem já usa um concorrente reconhece o padrão de interação em segundos — sidebar de ícones, card de agendamento com barra de cor, busca com lupa — e isso reduz atrito de adoção. A marca do Hello Doctor mora no nome, no selo e no domínio (foto clínica, mapa de aplicação, evolução antropométrica) — não em inventar uma gramática visual concorrente à que o mercado já entende.

**O que se mantém como restrição de uso, não gosto** (herdado da revisão 1, permanece porque é funcional, não estético):
- A tela de avaliação de foto clínica roda sobre cinza neutro fixo — cor saturada ao redor distorce a percepção de tom de pele. Ver seção 10.
- Contraste mínimo AA em todo texto.
- Densidade alta com respiro — a recepção fica o dia inteiro na agenda, o profissional entra por três minutos.
- Conteúdo real do domínio no guia — nunca lorem ipsum.

---

## 2. Paleta

Valores extraídos diretamente do Amigo Clinic, usados sem aproximação. Onde um valor não existe no site (ex.: variante escura de um acento para garantir contraste de texto), ele é **derivado e marcado como tal** — nunca inventado como "gosto", sempre como consequência técnica de AA.

### 2.1 Cor de marca

| Token | Valor | Origem | Uso |
|---|---|---|---|
| `--cor-primario` | `#0088FF` | Extraído | Cor de marca. Ícone, borda ativa, link, linha de gráfico, preenchimento de superfície grande |
| `--cor-primario-claro` | `#4DACFF` | Extraído | Acento secundário do azul — hover leve, texto/ícone sobre fundo escuro |
| `--cor-primario-forte` | `#0068B3` | **Derivado** | Preenchimento de botão sólido com texto branco. `#0088FF` puro dá 3.5:1 com branco — abaixo do mínimo AA de texto (4.5:1). Esta é a única correção sistemática sobre os valores extraídos, e existe só para essa combinação |
| `--cor-primario-superficie` | `#F4F9FF` | Extraído | Fundo tonal azul suave — card de agendamento confirmado, estado selecionado |

### 2.2 Cor de apoio (comercial)

O spec de arquitetura exige que fique óbvio na tela o que é clínico e o que é comercial (orçamento, venda, comissão). O Amigo usa "laranja de apoio" para ícone em quadrado colorido — adotamos essa mesma cor como o segundo acento do sistema, reservado para contexto comercial, para não sobrecarregar o azul (que é o acento de sistema/clínico por padrão).

| Token | Valor | Origem | Uso |
|---|---|---|---|
| `--cor-suporte` | `#FF8A3D` | **Derivado**, tom consistente com o "laranja de apoio" observado no site | Ícone em quadrado, acento de contexto comercial (orçamento, venda, comissão) |
| `--cor-suporte-forte` | `#C15F1E` | **Derivado** | Texto/preenchimento com garantia de AA |
| `--cor-suporte-superficie` | `#FFF3E9` | **Derivado**, mesma lógica tonal de `--cor-primario-superficie` | Fundo tonal laranja suave — badge e card de contexto comercial |

### 2.3 Neutros e superfícies

| Token | Valor | Origem | Uso |
|---|---|---|---|
| `--cor-base` | `#FFFFFF` | Extraído | Fundo de página, cor de card |
| `--cor-neutro-50` | `#F6F8F9` | Extraído | Fundo de seção neutra, alternância de linha em tabela |
| `--cor-neutro-100` | `#F0F2F5` | Extraído | Fundo de campo de busca, superfície neutra mais presente |
| `--cor-borda` | `#E4E8ED` | **Derivado** | Borda de 1px que acompanha toda sombra suave — o Amigo usa elevação por sombra difusa + borda clara, não sombra pesada sozinha |
| `--cor-borda-forte` | `#CDD3DB` | **Derivado** | Borda de card selecionado, divisor com mais peso |
| `--cor-escuro` | `#111624` | Extraído | Seção invertida de marketing, base do tema escuro do produto |

### 2.4 Semânticas

| Token | Valor | Origem | Uso |
|---|---|---|---|
| `--cor-sucesso` | `#16A300` | Extraído | Ícone, ponto de status, borda — confirmado, pago, dentro do esperado |
| `--cor-sucesso-claro` | `#5CB85C` | Extraído | Variante clara do verde — usada em conjunto com o forte para dar profundidade a gráfico/ícone |
| `--cor-sucesso-forte` | `#0F7A00` | **Derivado** | Texto sobre fundo claro, preenchimento sólido — `#16A300` puro dá 3.35:1, abaixo de AA de texto |
| `--cor-sucesso-superficie` | `#EAF8E8` | **Derivado** | Fundo tonal — badge, card de status positivo |
| `--cor-erro` | `#F76556` | Extraído | Ícone, ponto de status, borda — vencido, faltou, fora de escopo |
| `--cor-erro-forte` | `#C93B28` | **Derivado** | Texto sobre fundo claro, preenchimento sólido — mesmo motivo do sucesso |
| `--cor-erro-superficie` | `#FEEDEB` | **Derivado** | Fundo tonal — badge, card de alerta |
| `--cor-atencao-forte` | `#C98A00` | **Derivado** — o site não expõe um terceiro estado de aviso; um SaaS de agenda precisa de "a vencer" além de "confirmado" e "cancelado", então esta cor segue a mesma lógica tonal do sistema | Texto/ícone — a vencer, aderência em risco, estoque baixo |
| `--cor-atencao-superficie` | `#FFF6E5` | **Derivado** | Fundo tonal — badge de atenção |

### 2.5 Texto

| Token | Valor | Uso | Contraste sobre `--cor-base` |
|---|---|---|---|
| `--texto-forte` | `#14191E` | Título, valor de destaque | 17.9:1 (AAA) |
| `--texto-medio` | `#29343D` | Subtítulo, rótulo de campo | 13.1:1 (AAA) |
| `--cor-corpo` | `#333333` | Texto corrido | 12.6:1 (AAA) |
| `--texto-fraco` | `#3D4E5C` | Legenda, metadado, texto secundário | 8.6:1 (AAA) |

---

## 3. Tipografia

**Família única: Inter.** Nada de segunda fonte de destaque — é uma regra do Amigo, não uma limitação nossa: o peso leve do título grande já carrega a personalidade, uma segunda família só competiria com ela.

**Regra dura: títulos nunca usam weight 700 (bold).** Máximo 500 (medium) em qualquer título — é a assinatura do visual do Amigo: título grande e leve, não grande e pesado. 600 (semibold) é reservado para texto muito pequeno (rótulo de 11px, onde o peso extra compensa o tamanho), nunca para título.

| Token | Peso/tamanho/altura de linha | Cor | Uso |
|---|---|---|---|
| `--tipo-h1` | 500, 56px/1.05 | `--texto-forte` | Hero de marketing — não aparece dentro do produto |
| `--tipo-h2` | 500, 32px/1.12 | `--texto-forte` | Título de página dentro do produto |
| `--tipo-h3` | 500, 22px/1.2 | `--texto-forte` | Título de seção dentro de página |
| `--tipo-titulo` | 500, 17px/1.3 | `--texto-forte` | Título de card, cabeçalho de modal |
| `--tipo-subtitulo` | 500, 15px/1.4 | `--texto-medio` | Subtítulo, rótulo de campo |
| `--tipo-corpo` | 400, 16px/1.55 | `--cor-corpo` | Texto corrido |
| `--tipo-corpo-pequeno` | 400, 14px/1.5 | `--cor-corpo` | Texto de apoio, célula de tabela |
| `--tipo-legenda` | 400, 14px/1.4 | `--texto-fraco` | Legenda, metadado, timestamp |
| `--tipo-rotulo` | 600, 11px/1.3, tracking 0.06em, uppercase | `--texto-fraco` | Overline, cabeçalho de coluna |
| `--tipo-dado` | 500, 14px/1.4, `font-variant-numeric: tabular-nums` | `--texto-medio` | Medida, lote, telefone, CPF — ainda em Inter, alinhado por número tabular, não por família monoespaçada |
| `--tipo-dado-forte` | 600, 15px/1.4, tabular-nums | `--texto-forte` | Valor monetário, número de destaque |

Não existe uma família "de dado" separada como na revisão anterior — o Inter com `tabular-nums` já resolve o alinhamento de coluna numérica sem quebrar a regra de família única.

---

## 4. Forma

| Token | Valor | Uso |
|---|---|---|
| `--raio-botao` | 12px | Botão, input, campo de busca |
| `--raio-card` | 20px | Card padrão (agendamento, badge grande, item de lista) |
| `--raio-card-lg` | 24px | Card de destaque (card de paciente, card de IA flutuante) |
| `--raio-secao` | 32px | Bloco/seção grande, painel principal |
| `--raio-icone` | 16px | Quadrado colorido que envolve um ícone |
| `--raio-sidebar-ativo` | 10px | Fundo do ícone ativo na sidebar |
| `--raio-full` | 999px | Avatar, pill, badge, dot |

Nenhum raio é zero e nenhum excede 32px — cantos sempre arredondados, nunca angulares (diferente da revisão anterior, que usava raios pequenos e "precisos"; aqui o raio grande e macio **é** a assinatura de forma).

---

## 5. Elevação

Sombra muito suave e difusa, nunca dura — sempre acompanhada de borda de 1px clara. É assim que o Amigo separa camada sem pesar a tela.

| Token | Valor | Uso |
|---|---|---|
| `--sombra-1` | `0 1px 2px rgba(17,22,36,.05)` | Card em repouso, junto de `--cor-borda` |
| `--sombra-2` | `0 8px 24px rgba(17,22,36,.08)` | Dropdown, card em hover, card de IA flutuante |
| `--sombra-3` | `0 24px 56px rgba(17,22,36,.14)` | Modal, drawer |

No tema escuro a sombra quase desaparece (perde sentido sobre fundo escuro) e a separação de camada vira só a diferença de luminância entre `--cor-fundo` e `--cor-superficie`, reforçada por `--cor-borda` do tema escuro.

---

## 6. Espaçamento

Grid de 4px. A instrução do Amigo é "muito respiro, seções generosas, nada apertado no marketing" — então a escala inclui valores grandes (56–96px) para separar blocos de página, além da escala densa de UI.

| Token | Valor | Uso |
|---|---|---|
| `--espaco-1` | 4px | Entre ícone e rótulo, padding de badge |
| `--espaco-2` | 8px | Padding de célula densa, gap entre chips |
| `--espaco-3` | 12px | Padding de input |
| `--espaco-4` | 16px | Padding interno de card pequeno, gap de formulário |
| `--espaco-5` | 20px | Gap entre cards em grade |
| `--espaco-6` | 24px | Padding de card padrão |
| `--espaco-8` | 32px | Padding de card grande/seção, respiro entre bloco e título |
| `--espaco-10` | 40px | Padding de painel principal |
| `--espaco-14` | 56px | Separação entre seções de página |
| `--espaco-18` | 72px | Respiro de bloco de marketing |
| `--espaco-24` | 96px | Separação entre grandes blocos de marketing |

Na UI do produto (densidade alta, uso rápido), o respiro fica entre `--espaco-4` e `--espaco-8` — os valores acima de `--espaco-14` são de contexto de marketing/onboarding, não de tela de trabalho.

---

## 7. Movimento

Funcional, discreto — nada que compita com o respiro visual.

| Token | Valor | Uso |
|---|---|---|
| `--dur-rapida` | 140ms | Hover, foco, toggle |
| `--dur-padrao` | 220ms | Dropdown, expansão |
| `--dur-entrada` | 280ms | Modal, drawer, toast |
| `--easing` | `cubic-bezier(.22,.02,0,1)` | Todas as transições — desaceleração suave |

O único momento ambiente do sistema segue sendo o guia de enquadramento da captura de foto clínica, que pulsa até alinhar com a pose anterior — herdado da revisão 1 porque é funcional (ver seção 10), não decorativo. Respeita `prefers-reduced-motion`.

---

## 8. Grid e breakpoints

| Breakpoint | Largura | Comportamento |
|---|---|---|
| `--bp-tablet` | 768px | Sidebar de ícones permanece (é estreita o bastante), formulário vai para 1 coluna |
| `--bp-desktop` | 1024px | Layout completo com topbar de busca expandida |
| `--bp-wide` | 1440px | Conteúdo trava em 1280px, centralizado |

---

## 9. Acessibilidade

- **Contraste AA em todo texto.** Ver seção 2 para as variantes "-forte" derivadas especificamente para isso — `#0088FF`, `#16A300` e `#F76556` puros não passam em texto pequeno sobre fundo claro nem em texto branco sobre preenchimento sólido; por isso cada um tem uma variante "-forte" reservada a essas duas situações. O tom puro continua em todo uso não textual (ícone, ponto, borda, linha de gráfico), onde a regra é 3:1 (elemento gráfico/UI), que os três cumprem.
- **Alvo de toque mínimo de 44×44px** em qualquer elemento clicável em contexto de tablet.
- **Foco visível:** anel de 3px na cor de contexto (`--cor-primario` por padrão, `--cor-suporte` em contexto comercial), 2px de offset.
- **Nunca só cor:** todo estado (status de agendamento, badge, alerta) carrega ícone/ponto e texto.
- **Leitor de tela:** mesma disciplina da revisão 1 — `<label>` associado, `alt` descritivo em foto clínica, `role="dialog"`+`aria-modal` em modal/drawer com devolução de foco, `<th scope="col">` em tabela.
- **Tamanho mínimo de fonte:** 12px, só para metadado não essencial.

---

## 10. Caso especial — avaliação de foto clínica (Sala Neutra)

Regra inalterada da revisão 1, porque é restrição de uso e não de estética: cor saturada ao redor da foto distorce a percepção de tom de pele — o mesmo motivo pelo qual um monitor de radiologia roda em cinza calibrado. O rebranding para a linguagem Amigo **não entra aqui**.

- Fundo do visualizador: `#3C3C3C` fixo, não muda com o tema do produto.
- Chrome ao redor: texto `#EDEDED`, ícones `#C4C4C4` — sem azul, sem laranja.
- Guia de enquadramento: branco a 30% de opacidade, traço 1.5px.
- Régua de comparação: `#8A8A8A` neutro.

Chamada internamente de **Sala Neutra** — o único lugar do produto onde a marca conscientemente sai de cena.

---

## 11. Componentes

Todos renderizados em `docs/style-guide.html`, tema claro e escuro, com conteúdo real do domínio.

### Sidebar
Estreita, só ícones, 56px de largura, fundo `--cor-base`. Ícone ativo com fundo `--cor-primario-superficie` e `--raio-sidebar-ativo` (10px). Ícone inativo em `--texto-fraco`, hover para `--texto-medio`. Nunca mostra texto — tooltip ao hover identifica o item.

### Topbar
Fundo `--cor-base`, borda inferior `--cor-borda`. Selo + wordmark "Hello Doctor" à esquerda. Campo de busca central com ícone de lupa, fundo `--cor-neutro-100`, `--raio-botao`. Menus em texto simples com chevron. À direita: sino de notificação, avatar, e um botão **outline** de destaque (borda `--cor-primario`, texto `--cor-primario`, fundo transparente) para a ação primária do dia (ex.: "Novo agendamento").

### Botão
Três hierarquias: primário sólido (`--cor-primario-forte` de fundo, texto branco), secundário outline (borda `--cor-primario`, texto `--cor-primario`), terciário texto. `--raio-botao`, weight 500, nunca 700. Altura 44px (alvo de toque), 36px em toolbar densa.

### Campo de formulário com erro
Rótulo sempre visível, `--raio-botao`, borda `--cor-borda` em repouso, `--cor-primario` em foco, `--cor-erro` em erro com ícone à direita e mensagem em `--cor-erro-forte` com `role="alert"`.

### Select, Data, Upload
Mesma anatomia de raio e borda do campo de texto — consistência de escaneamento em formulário longo. Upload com dropzone tracejada e explicação de formato/limite.

### Tabela densa
Cabeçalho em `--tipo-rotulo`, linha 40 ou 48px conforme densidade, listras em `--cor-neutro-50`, número em `--tipo-dado` alinhado à direita.

### Card de paciente
Fundo `--cor-base`, `--raio-card-lg`, `--sombra-1` + borda `--cor-borda`. Nome em `--tipo-h3` (Inter 500, não mais serifa itálica), avatar circular à esquerda, chips com ponto colorido abaixo. A régua de andamento clínico/comercial se mantém — agora em `--cor-primario` (clínico) e `--cor-suporte` (comercial), a única mudança é a cor, não o conceito.

### Linha do tempo clínica
Vertical, nó preenchido em `--cor-primario` quando realizado, `--cor-erro` quando faltou, contornado quando planejado. Igual à revisão 1 em estrutura, cores atualizadas.

### Badge de status / Pill
Fundo branco ou tonal (`-superficie`), borda fina `--cor-borda`, `--raio-full`, ponto colorido de 6px à esquerda — é o padrão de pill do Amigo, substitui o badge de fundo sólido da revisão 1.

### Avatar
Circular, iniciais sobre `--cor-primario-superficie`/texto `--cor-primario-forte` sem foto.

### Modal, Drawer, Toast
`--raio-card-lg` (modal/drawer), `--sombra-3`. Toast com ícone de estado, nunca só cor. Comportamento (entrada, tempo de vida, devolução de foco) idêntico à revisão 1.

### Tabs
Sublinhado 2px na cor de contexto, sem fundo de pílula.

### Empty state, Skeleton, Paginação
Mesma lógica funcional da revisão 1 — traço fino, formato do conteúdo real, numérica preferida a scroll infinito — com raio e cor atualizados para o novo sistema.

### Agenda em colunas
Uma coluna por profissional, avatar circular no topo de cada coluna sublinhado por uma barra de cor (uma cor por profissional, dentro da paleta do sistema — `--cor-primario`, `--cor-sucesso`, `--cor-suporte` — para diferenciar coluna rapidamente sem precisar ler o nome).

### Card de agendamento
Fundo tonal da cor do status (`--cor-primario-superficie` confirmado, `--cor-sucesso-superficie` concluído, `--cor-erro-superficie` faltou), barra vertical de 3px na borda esquerda na cor forte correspondente, nome do paciente em weight 500, horário e unidade em `--tipo-legenda`, chip de tipo de procedimento embaixo. Este é o componente que mais muda em relação à revisão 1 — troca a linha de tabela densa por um cartão tonal, seguindo o padrão real do Amigo.

### Card de IA flutuante
Fundo branco, `--sombra-2`, ícone em quadrado `--cor-primario-superficie`/`--raio-icone`, título em `--tipo-titulo`, subtítulo em `--tipo-legenda`, tags com borda fina embaixo. Usado para o resumo de transcrição de consulta (fase 4 do roadmap) — mock no style guide já antecipa esse padrão.

### Gráfico de evolução, Comparador de foto, Mapa facial
Mesma lógica funcional da revisão 1 (eixo Y não forçado a zero, Sala Neutra para o comparador, popover de lote/produto no mapa) — cor da linha e dos marcadores trocada de petróleo para `--cor-primario`.

---

## 12. Tokens CSS

`docs/style-guide.html` contém o bloco `:root` (tema claro) e o par `[data-theme="dark"]`/`prefers-color-scheme`, prontos para colar em `globals.css` de um projeto Tailwind/Next.js. Nomes de token idênticos aos usados aqui.
