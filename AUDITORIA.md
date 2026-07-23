# 🔍 Auditoria Técnica — Base de Conhecimento (Apps Script + Sheets)

**Versão auditada:** 8 arquivos · 1.776 linhas
`Code.gs` (32) · `Database.gs` (270) · `Utils.gs` (97) · `Index.html` (55) · `Home.html` (62) · `Cadastro.html` (62) · `Style.html` (601) · `Script.html` (597)

**Status:** relatório de análise + **todas as 10 fases executadas** (seções 8 a 17). Plano concluído.

**Requisitos incorporados:** R-01 hierarquia (seção 2.7) e R-02 hierarquia mais evidente (seção 2.8).

**Requisito adicional incorporado:** hierarquia Categoria → Subcategoria (R-01, seção 2.7).

---

## 1. Sumário executivo

O sistema está funcionalmente correto e a arquitetura escolhida (cache local + 1 leitura por sessão) é a decisão certa para a plataforma. A camada de dados é sólida: `LockService` em todas as escritas, validação server-side, escape de HTML consistente, IDs sequenciais robustos a exclusões.

Encontrei **19 achados**. Um deles é **crítico e pode causar perda de acesso à base inteira em produção** — dado que sua prioridade absoluta é preservar dados, ele deve ser corrigido antes de qualquer melhoria visual.

| Severidade | Qtd. | Natureza |
|---|---|---|
| 🔴 Crítico | 1 | Risco de perda de acesso aos dados |
| 🟠 Alto | 4 | Bugs visíveis ao usuário + gargalo de escala |
| 🟡 Médio | 8 | Performance, acessibilidade, UX |
| 🔵 Baixo | 6 | Organização, dívida técnica |

**Veredito sobre a UI:** a interface atual é competente mas "genérica" — o problema não é falta de recursos, é falta de **hierarquia visual e sistema de espaçamento**. Isso se resolve com design tokens e refino de tipografia, não com reescrita. A base CSS já usa variáveis, então a evolução é incremental e de baixo risco.

---

## 2. Achados por categoria

### 2.1 🔴 Integridade de dados

#### A-01 · CRÍTICO · `obterPlanilha_()` pode abandonar a base de produção

`Database.gs`, função `obterPlanilha_()`:

```javascript
try {
  return SpreadsheetApp.openById(id);
} catch (e) {
  // Arquivo foi excluído — recria abaixo.
}
var ss = SpreadsheetApp.create(DB_NOME_ARQUIVO);
props.setProperty(DB_PROP_KEY, ss.getId());  // ← sobrescreve o ID da base real
```

O `catch` assume que **qualquer** falha significa "arquivo excluído". Mas `openById` também falha por causas **transitórias**: quota de leitura do Drive estourada, instabilidade do serviço, timeout, revogação temporária de permissão.

Quando isso acontece, o sistema cria uma planilha vazia e **sobrescreve o ID da base real em ScriptProperties**. Resultado: o sistema abre normalmente, vazio, e todos os cadastros novos vão para a planilha nova. A base original não é apagada — mas fica órfã, e o usuário não tem como saber disso pela interface. Se ninguém perceber por alguns dias, você terá duas bases parciais para reconciliar manualmente.

**Correção proposta:** só recriar se o erro confirmar ausência do arquivo; em qualquer outro caso, propagar o erro com mensagem clara. Nunca sobrescrever um ID já existente sem validação. Adicionalmente, gravar o ID anterior em uma chave de backup (`BC_SPREADSHEET_ID_ANTERIOR`) antes de qualquer troca.

> É o Log Pose apontando para outra ilha no meio do Grand Line — o navio continua navegando com toda confiança, só que para o lugar errado, e ninguém percebe até ser tarde.

#### A-02 · ALTO · `configurarAbas_()` sobrescreve cabeçalhos existentes

`configurarAbas_()` é chamada por `abaPorTipo_()` sempre que **uma** das abas não é encontrada — mas ela reescreve o cabeçalho das **duas** abas com `setValues`. Se alguém tiver ajustado um cabeçalho na planilha de produção, ele é silenciosamente revertido.

Não há perda de registros (só a linha 1 é tocada), mas viola a regra "não alterar estrutura das planilhas existentes".

**Correção proposta:** escrever o cabeçalho apenas quando a aba estiver vazia (`getLastRow() === 0`).

#### A-03 · MÉDIO · Exclusão é permanente e sem rastro

`deleteRecord` usa `deleteRow` — irreversível, sem log de quem excluiu. Em um sistema sem login onde qualquer pessoa pode apagar qualquer registro, isso é um risco operacional real.

**Correção proposta (sem violar as regras):** criar uma aba **nova** `LIXEIRA` com o mesmo layout de colunas. Excluir passa a mover a linha para lá, com data e autor. As abas `FAQ` e `TABULAÇÕES` permanecem intactas, nenhuma coluna é renomeada, nenhum ID muda, e sistemas antigos continuam lendo normalmente. Zero migração obrigatória.

---

### 2.2 🐛 Bugs funcionais

#### B-01 · ALTO · Filtro de categoria fantasma

`Script.html`, `atualizarCategorias()`:

```javascript
if (categorias.includes(valorAtual)) select.value = valorAtual;
```

Se você excluir o último registro de uma categoria enquanto ela está selecionada no filtro, a `<option>` desaparece e o `<select>` volta visualmente para "Todas as categorias" — mas **`Estado.filtroCategoria` continua com o valor antigo**. A lista fica permanentemente vazia e a interface não mostra motivo algum. O usuário só resolve recarregando a página.

**Correção:** sincronizar o estado quando a categoria deixar de existir.

#### B-02 · MÉDIO · Sem timeout em `google.script.run`

Se o Apps Script demorar ou a chamada se perder, `withFailureHandler` nunca dispara. O botão fica travado em "Salvando…" com `disabled` e `Estado.salvando = true` para sempre. O usuário precisa recarregar e perde o que digitou.

**Correção:** `Promise.race` com timeout de ~30 s e mensagem de erro recuperável (mantendo o formulário preenchido).

#### B-03 · MÉDIO · Cache local nunca revalida

Dois atendentes trabalhando ao mesmo tempo não veem os cadastros um do outro até recarregar a página. Numa operação de call center isso significa duplicidade de cadastro e uso de texto desatualizado.

**Correção:** botão "Atualizar" no cabeçalho + revalidação automática quando a aba volta ao foco (`visibilitychange`) com intervalo mínimo (ex.: 2 min).

#### B-04 · BAIXO · `#print-area` mantém conteúdo residual

Após imprimir, o HTML do registro permanece no DOM até a próxima impressão. Sem impacto visual (só existe em `@media print`), mas é lixo de estado.

#### B-05 · BAIXO · Fila de toasts sem limite

Cliques repetidos em "Copiar" empilham toasts indefinidamente, cobrindo a tela em telas pequenas.

---

### 2.3 ⚡ Performance e escalabilidade

#### P-01 · ALTO · Custo da busca cresce com o tamanho do texto (gargalo principal)

Este é o gargalo mais sério do cliente, e ele **não** está no número de registros — está no `destacar()`.

A cada tecla digitada, para **cada** registro visível, `destacar()` executa:

```javascript
Array.from(original).map(c => c.toLowerCase().normalize('NFD').replace(...)).join('')
```

Isso cria um array de caracteres e chama `normalize()` **caractere por caractere** sobre o texto completo. Com 400 registros de ~1.500 caracteres, são ~600 mil chamadas de `normalize()` **por tecla**. Some a isso o `filtrar()`, que normaliza 4 campos de cada registro na mesma tecla, e o `ordenar()`, que faz parse de string de data a cada comparação do `sort`.

**Correção:** pré-computar, **uma única vez** no carregamento, um índice por registro:

```javascript
r._busca = normalizar(r.categoria + ' ' + r.descricao + ' ' + r.texto + ' ' + r.criadoPor);
r._normTexto = normalizar(r.texto);   // para o destaque
r._ts = tempoDe(r.dataCriacao);       // para a ordenação
```

O trabalho por tecla cai de centenas de milhares de operações para uma varredura de `indexOf`. É a diferença entre o Zoro procurando o caminho toda vez e alguém já ter desenhado o mapa.

#### P-02 · ALTO · Payload único sem paginação

`getAllRecords()` devolve **todos** os registros com o texto completo em uma só resposta. Com 3.000 registros × 1,5 KB, são ~4,5 MB serializados via `google.script.run` — lento no celular e sujeito a estouro de limite do HtmlService.

**Correção escalonada** (só quando necessário — hoje ainda não é):
1. Enviar primeiro um índice leve (sem o campo `texto`), carregando o texto sob demanda; **ou**
2. `CacheService` no servidor (atenção: **limite de 100 KB por chave** — exige fatiar em blocos).

#### P-03 · MÉDIO · Re-render total do DOM em toda interação

`renderizar()` reconstrói a lista inteira com `innerHTML` — e é chamada em **9 pontos**, incluindo favoritar e expandir um único card. Favoritar destrói e recria 400 elementos DOM para trocar uma estrela.

**Correção:** operações que afetam um card só atualizam aquele card (`querySelector` pelo `data-id`). Re-render completo apenas quando busca/filtro mudam.

#### P-04 · MÉDIO · Lista sem limite de renderização

Sem paginação nem *lazy rendering*, 2.000 registros = 2.000 cards no DOM simultaneamente.

**Correção recomendada:** renderização incremental — 60 cards iniciais + `IntersectionObserver` carregando o próximo lote no scroll.

**Virtualização completa: NÃO recomendo.** Ela quebra Ctrl+F do navegador, complica a impressão e adiciona ~150 linhas de código frágil. Renderização incremental entrega 95% do ganho com 10% da complexidade.

---

### 2.4 ♿ Acessibilidade

#### AC-01 · MÉDIO · Semântica ARIA incorreta nos filtros

`Home.html` usa `role="tablist"` / `role="tab"` nos chips, mas **sem** `aria-selected` e **sem** nenhum elemento `role="tabpanel"` associado. Para um leitor de tela, o resultado é pior do que não ter ARIA nenhuma: ele anuncia "aba" e busca um painel que não existe.

**Correção:** trocar por `role="group"` + `aria-pressed="true|false"` nos botões (são toggles, não abas).

#### AC-02 · MÉDIO · Modal sem *focus trap* e sem devolução de foco

Com o modal aberto, Tab navega pelos elementos **atrás** dele. Ao fechar, o foco vai para o `<body>` em vez de voltar ao botão que o abriu — usuário de teclado perde a posição na lista.

#### AC-03 · MÉDIO · Botões de ícone sem nome acessível

`📋`, `✏️`, `🖨️`, `🗑️`, `☆` têm `title` (tooltip do mouse), mas leitores de tela leem apenas o emoji. Faltam `aria-label`.

#### AC-04 · BAIXO · Ausência de `aria-live` nos resultados

A contagem de resultados muda durante a digitação sem anúncio para leitores de tela.

---

### 2.5 🔐 Segurança

**Avaliação geral: adequada para o modelo de ameaça.** Sem achados críticos.

- ✅ XSS coberto: `escaparHtml()` aplicado consistentemente, inclusive dentro de `destacar()` e em atributos `title`.
- ✅ Validação **server-side** em `validarDados_()` — não confia no cliente.
- ✅ `LockService` em todas as escritas.
- ⚠️ **S-01 · MÉDIO:** ausência total de autorização é uma decisão de projeto, mas combinada com exclusão permanente (A-03) cria risco real. A aba `LIXEIRA` mitiga sem introduzir login.
- ⚠️ **S-02 · BAIXO:** conflito de edição simultânea é *last-write-wins* silencioso. Dois supervisores editando o mesmo texto: um perde o trabalho sem aviso. Mitigação barata: comparar `ultimaAlteracao` no `updateRecord` e avisar se mudou.

---

### 2.6 🧱 Arquitetura e código

| ID | Sev. | Achado |
|---|---|---|
| C-01 | 🔵 | **Sem separação UI / lógica.** `Script.html` mistura estado, template, chamadas ao servidor e eventos em 597 linhas. Sugestão: módulos `Estado`, `Api`, `Render`, `Acoes` no mesmo arquivo (Apps Script não tem *bundler*). |
| C-02 | 🔵 | **Navegação espalhada.** `hidden` manipulado em 4 lugares diferentes. Um `irPara(tela)` central resolve. |
| C-03 | 🔵 | **Tokens de tema duplicados.** 3 blocos × ~20 variáveis quase idênticas em `Style.html`. Separar em *primitivos* (paleta) e *semânticos* (`--superficie`, `--texto`) reduz à metade e evita divergência ao criar o 4º tema. |
| C-04 | 🔵 | **Ausência de escala de espaçamento.** Valores avulsos (`10px`, `14px`, `16px`, `18px`, `20px`, `28px`) — é a causa raiz do visual "quase profissional". Uma escala 4/8/12/16/24/32 resolve mais do que qualquer efeito novo. |
| C-05 | 🔵 | **Cor institucional duplicada** entre `Database.gs` (`#0047BB` no cabeçalho da planilha) e `Style.html`. |
| C-06 | 🔵 | `localizarLinha_()` é O(n) por operação — aceitável até ~10 mil linhas, não é gargalo hoje. Registrado apenas para acompanhamento. |

---

### 2.7 📐 Requisito novo — Hierarquia Categoria → Subcategoria

#### R-01 · ALTO · Navegação hierárquica em 3 níveis (FAQ e Tabulações)

**Necessidade:** localizar conteúdo hoje depende de lembrar a palavra certa. Com o volume crescendo, o atendente precisa **navegar** até o conteúdo, não só buscar.

**Hierarquia pedida:**

```
Cartão de crédito  ›  Cancelamento  ›  Qual motivo?
   Categoria           Subcategoria      Descrição/Cenário
```

**Descoberta importante para o custo da mudança:** o terceiro nível **já existe** — é a coluna `Descrição/Cenário`. Falta apenas **um** nível intermediário. Ou seja, o requisito inteiro se resolve com **uma única coluna nova**, e não com uma remodelagem do banco.

**Impacto na estrutura (compatível com todas as suas regras):**

| Regra do briefing | Situação |
|---|---|
| ❌ Alterar estrutura das planilhas existentes | ✅ Respeitada — nenhuma coluna existente é movida ou redimensionada |
| ❌ Renomear colunas existentes | ✅ Respeitada — `Subcategoria` entra como coluna **H**, ao final |
| ❌ Apagar dados / alterar IDs | ✅ Respeitada — nenhuma linha é reescrita |
| ❌ Criar migração obrigatória | ✅ Respeitada — registros antigos ficam com subcategoria vazia e continuam funcionando |

Registros sem subcategoria são exibidos como **"Geral"**. Nada quebra, nada precisa ser preenchido em massa: a equipe classifica aos poucos, na edição normal do dia a dia.

> É o Grand Line: dá para navegar sem o Log Pose, mas ninguém quer. A subcategoria é o ponteiro que evita ficar tentando adivinhar a rota a cada atendimento.

**Escopo de implementação previsto:**

| Camada | Mudança |
|---|---|
| Planilha | Coluna `Subcategoria` (H) em ambas as abas, criada só se a célula H1 estiver vazia |
| `Database.gs` | Leitura/gravação de 8 colunas, com *fallback* para bases de 7 colunas |
| Formulário | Campo Subcategoria com sugestões **filtradas pela categoria escolhida** (datalist em cascata) |
| Filtros | Segundo `<select>` de subcategoria, habilitado ao escolher uma categoria |
| Cards | *Breadcrumb* `Cartão de crédito › Cancelamento` no topo do card |
| Busca | Subcategoria incluída no índice de pesquisa |
| Navegação | Árvore recolhível por categoria → subcategoria na lateral (desktop) |

**Riscos:** baixos. O único ponto de atenção é base antiga com 7 colunas — coberto por leitura defensiva (`linha[7] || ''`).

---

### 2.8 📐 Requisito novo — Categoria e subcategoria mais evidentes

#### R-02 · MÉDIO · Aumentar o peso visual da hierarquia no card

**Necessidade:** a hierarquia existe e funciona (Fase 2), mas no card ela ainda aparece como texto pequeno e acinzentado no topo — o mesmo tratamento dado a metadados secundários. Para quem varre a lista durante um atendimento, o caminho `Cartão de crédito › Cancelamento` é informação de **localização**, não de rodapé.

**Diagnóstico:** hoje o caminho usa `--t-xs` (12px), peso 600 e `--texto-sutil`. A descrição, logo abaixo, usa 15px e peso 650. A hierarquia perde a disputa visual justamente para o elemento que ela deveria contextualizar.

**Propostas a avaliar na implementação:**

| Opção | Efeito | Custo |
|---|---|---|
| **Pílula tingida na cor da categoria** (em vez do ponto + texto cinza) | A categoria vira um objeto reconhecível de relance; aproveita a cor já calculada na Fase 4 | Baixo |
| **Subcategoria como segunda pílula**, em tom mais claro | Torna os dois níveis distinguíveis sem ler o texto | Baixo |
| **Agrupamento por categoria na lista**, com cabeçalho fixo ao rolar | Transforma a lista em navegação hierárquica de verdade | Médio |
| **Árvore lateral recolhível** (desktop) | Navegação completa sem depender da busca | Médio-alto |
| Aumentar tipografia do caminho e escurecer a cor | Correção mínima, sem mudança estrutural | Muito baixo |

**Recomendação preliminar:** combinar as duas primeiras (pílulas coloridas) com o agrupamento por categoria. A árvore lateral fica para depois — ela resolve o mesmo problema com muito mais superfície de código e complica o responsivo.

**Riscos:** baixos e visuais. O agrupamento interfere na ordenação atual (favoritos primeiro, depois data), então precisa de decisão explícita: agrupar apenas quando não há busca ativa, mantendo a lista plana durante a pesquisa.

---

## 3. Avaliação das melhorias sugeridas por você

Nem tudo que foi listado no briefing vale o custo. Meu parecer honesto:

| Recurso proposto | Veredito | Justificativa |
|---|---|---|
| **Hierarquia Categoria → Subcategoria (R-01)** | ✅ **Prioridade de negócio** | Único requisito funcional da lista; custo baixo (1 coluna) e ganho direto no tempo de atendimento. |
| **Design tokens + escala de espaçamento** | ✅ **Fazer primeiro (visual)** | Maior ganho visual por linha de código. Zero risco funcional. |
| **Dashboard com indicadores** | ✅ Fazer | Os dados já estão no cache — custo quase zero, ganho de percepção alto. Como aba, não como tela inicial obrigatória (atendente quer buscar, não ver gráfico). |
| **Histórico de pesquisa** | ✅ Fazer | Barato (localStorage), alto valor em call center — as mesmas buscas se repetem o dia todo. |
| **Cores por categoria (tags)** | ✅ Fazer | Hash determinístico do nome → cor. Sem cadastro extra, sem mudança na planilha. |
| **Tela de Configurações** | ✅ Fazer | Consolida o que já existe espalhado (tema, animações, densidade). |
| **Validação em tempo real no formulário** | ✅ Fazer | Barato e elimina o toast de erro genérico. |
| **Skeleton / loading moderno** | ✅ Fazer | Já existe, só precisa refinar (e o bug do `hidden` já foi corrigido). |
| **Renderização incremental** | ✅ Fazer | Necessária a partir de ~500 registros. |
| **Auto Save no formulário** | ⚠️ Parcial | Auto-save **no servidor** geraria registros-fantasma e IDs desperdiçados. Faça **rascunho em localStorage**: recupera o texto se a aba fechar, sem tocar na planilha. |
| **Operadores AND / OR na busca** | ⚠️ Só o AND | Múltiplas palavras = AND implícito (intuitivo, ninguém precisa aprender). Sintaxe `OR`/`NOT` explícita: atendente sob pressão não usa, e vira superfície de bug. |
| **Virtualização da lista** | ❌ Não fazer | Quebra Ctrl+F e impressão. Renderização incremental resolve. |
| **Drag and drop** | ❌ Não fazer | Não há ordenação manual persistida no modelo de dados — exigiria coluna nova (regra proíbe) e não resolve dor real: a ordem que importa é a da busca. |
| **Paginação numerada** | ❌ Não fazer | Scroll infinito é superior para busca. Configuração de "registros por página" só adiciona uma decisão que o usuário não quer tomar. |

---

## 4. Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Refatoração de CSS quebrar layout em algum tema | Média | Baixo | Alterar tokens, não regras; testar os 3 temas a cada fase |
| Pré-computar índice de busca alterar resultados | Baixa | Médio | Índice derivado dos mesmos campos; validar com termos acentuados |
| Aba `LIXEIRA` confundir contagens | Baixa | Baixo | `getAllRecords` não lê a aba nova — invisível para o fluxo atual |
| Renderização incremental atrapalhar impressão | Média | Baixo | Renderizar tudo antes de `window.print()` |
| Regressão silenciosa entre fases | Média | Alto | Checklist de validação (seção 6) a cada entrega |
| **Não corrigir A-01** | Baixa | **Crítico** | Correção na Fase 0, antes de tudo |

---

## 5. Plano de implementação

Uma fase por entrega, cada uma independente e reversível. Nenhuma exige migração de dados.

| Fase | Escopo | Arquivos tocados | Risco | Status |
|---|---|---|---|---|
| **0 — Blindagem** | A-01, A-02, B-01, B-02 | `Database.gs`, `Script.html` | Muito baixo | ✅ **Concluída** |
| **1 — Fundação visual** | Design tokens, escala de espaçamento, tipografia, hierarquia dos cards, hover/foco | `Style.html` (só CSS) | Baixo | ✅ **Concluída** |
| **2 — Hierarquia (R-01)** | Coluna Subcategoria, formulário em cascata, filtros, breadcrumb nos cards | `Database.gs`, `Utils.gs`, `Cadastro.html`, `Home.html`, `Script.html`, `Style.html` | Médio | ✅ **Concluída** |
| **3 — Motor de busca** | P-01 (índice pré-computado, já incluindo subcategoria), P-03 (render cirúrgico), AND implícito, histórico de busca | `Script.html`, `Home.html`, `Style.html` | Médio | ✅ **Concluída** |
| **4 — Cards e categorias** | Cores por categoria, badges, densidade, favoritos mais visíveis | `Style.html`, `Script.html`, `Home.html` | Baixo | ✅ **Concluída** |
| **5 — Acessibilidade** | AC-01 a AC-04, contraste WCAG, *focus trap*, navegação por teclado | `Index.html`, `Home.html`, `Cadastro.html`, `Script.html`, `Style.html` | Baixo | ✅ **Concluída** |
| **6 — Hierarquia evidente (R-02)** | Pílulas coloridas, agrupamento na lista e limpar filtros | `Script.html`, `Style.html`, `Home.html` | Baixo | ✅ **Concluída** |
| **7 — Dashboard** | Indicadores a partir do cache, incluindo uso por categoria/subcategoria | novo `Dashboard.html`, `Index.html`, `Script.html`, `Style.html` | Baixo | ✅ **Concluída** |
| **8 — Configurações** | Tela de preferências (tema, densidade, animações, busca) | novo `Config.html`, `Index.html`, `Script.html`, `Style.html` | Baixo | ✅ **Concluída** |
| **9 — Escala** | Renderização incremental, B-03 (revalidação), A-03 (lixeira) | `Database.gs`, `Script.html`, `Home.html`, `Config.html`, `Style.html` | Médio | ✅ **Concluída** |

**Fase 0 é pré-requisito de todas as outras.** A Fase 2 (hierarquia) vem logo após a fundação visual porque é o único requisito **funcional** da lista — as demais são refinamento. As fases 4–8 podem ser reordenadas conforme sua prioridade.

---

## 6. Checklist de validação (executar após cada fase)

| # | Verificação |
|---|---|
| 1 | Registros existentes aparecem com ID, autor e datas corretos |
| 2 | Novo cadastro FAQ gera ID na sequência correta |
| 3 | Novo cadastro Tabulação gera ID na sequência correta |
| 4 | Edição preserva o ID e atualiza "Última alteração" |
| 5 | Exclusão remove só o registro alvo |
| 6 | Busca com acento e sem acento retorna o mesmo resultado |
| 7 | Destaque do termo aparece corretamente |
| 8 | Filtros Todos / FAQs / Tabulações funcionam |
| 9 | Filtro por categoria funciona **e reseta corretamente** |
| 10 | Favoritos persistem após recarregar |
| 11 | Copiar envia o texto completo para a área de transferência |
| 12 | Impressão gera o layout correto |
| 13 | Os 3 temas renderizam sem quebra |
| 14 | Tema persiste após recarregar |
| 15 | Ctrl+K, Ctrl+N e Esc funcionam |
| 16 | Layout íntegro em 360px, 768px, 1024px e 1440px |
| 17 | Nenhuma linha da planilha foi alterada fora do fluxo esperado |
| 18 | *(a partir da Fase 2)* Registros antigos sem subcategoria continuam visíveis como "Geral" |
| 19 | *(a partir da Fase 2)* Subcategoria filtra em cascata a partir da categoria |

---

## 7. Recomendação

Ordem recomendada: **Fase 0** (executada) → **Fase 1** (fundação visual, só CSS, risco quase nulo) → **Fase 2** (hierarquia Categoria → Subcategoria, o requisito funcional).

---

## 8. Fase 0 — Executada ✅

**Arquivos alterados:** `Database.gs`, `Script.html`. Nenhuma mudança de estrutura na planilha, nenhum dado tocado.

### O que mudou

| ID | Correção |
|---|---|
| **A-01** | A base só é criada automaticamente quando **não existe nenhum ID registrado** (primeira execução). Havendo ID, uma falha de abertura gera nova tentativa após 700 ms e, persistindo, **propaga o erro** em vez de criar planilha nova. O ID de produção nunca é sobrescrito por falha transitória. |
| **A-01b** | Nova função administrativa `recriarBaseDeDados()`, de execução **manual** no editor, para o caso de exclusão real da planilha. Ela guarda o ID anterior em `BC_SPREADSHEET_ID_ANTERIOR`. |
| **A-02** | `escreverCabecalho_()` substitui `configurarAbas_()` e **só escreve em aba vazia** (`getLastRow() === 0`). Abas em produção nunca têm o cabeçalho reescrito. |
| **B-01** | `atualizarCategorias()` zera `Estado.filtroCategoria` quando a categoria selecionada deixa de existir, mantendo estado e `<select>` sincronizados. |
| **B-02** | `servidor()` ganhou timeout de 30 s com *guard* de resolução única: a Promise resolve ou rejeita uma só vez, respostas tardias são descartadas sem erro e o botão nunca fica preso em "Salvando…". |

### Validação executada

- ✅ `node --check` em todo o código servidor e cliente
- ✅ **18 verificações** no servidor: falha transitória não recria base, ID de produção preservado, retry confirmado, primeira execução ainda cria a base, backup do ID anterior, cabeçalho de aba com dados intocado
- ✅ **Regressão de CRUD:** registros existentes carregados, IDs preservados (`FAQ-0001`, `FAQ-0007`, `TAB-0003`), novo cadastro seguindo a sequência (`FAQ-0008`, `TAB-0004`), edição preservando ID, exclusão atingindo só o alvo, validação server-side ativa
- ✅ **11 verificações** no cliente: timeout dispara, resposta tardia ignorada sem erro, mensagem de erro do servidor preservada, filtro de categoria sincronizado nos 4 cenários

### Compatibilidade

Nenhuma mudança de comportamento visível para o usuário, exceto mensagens de erro mais claras. Planilha, colunas, IDs, favoritos, temas, cache, busca e impressão permanecem exatamente como estavam.


---

## 9. Fase 1 — Executada ✅

**Arquivo alterado:** `Style.html` (exclusivamente CSS). Nenhum nome de classe, ID ou estrutura de HTML foi tocado — por isso o risco funcional é nulo.

### Arquitetura de tokens (corrige C-03 e C-04)

Três camadas, substituindo os 3 blocos duplicados de variáveis:

1. **Escalas globais** — espaçamento (base 4px), raio, tipografia, movimento e layout
2. **Primitivos por tema** — paleta bruta (`--p-acento`, `--p-cinza-*`, sombras)
3. **Semânticos** — papéis de uso (`--superficie`, `--texto`, `--borda`)

Componentes consomem **apenas** as camadas 1 e 3. Criar um quarto tema passa a exigir redefinir só os primitivos.

### Decisões visuais

| Decisão | Justificativa |
|---|---|
| **Escala de espaçamento de 4px** em todo padding, gap e margem | Elimina os valores avulsos (10/14/18/28px) — causa raiz do visual "quase profissional" |
| **Cards quase planos, com borda de 1px** | Com dezenas de cards na tela, sombra em cada um vira ruído. A elevação passa a indicar o que está sob o cursor |
| **Busca com 48px de altura e destaque próprio** | É onde o atendimento começa; recebe mais peso visual que qualquer outro controle |
| **Chips como controle segmentado** | Agrupa os filtros em um único objeto; a cor aparece só no estado ativo |
| **"Copiar" em destaque permanente** | É o objetivo final de quase todo atendimento — deixa de competir com os ícones secundários |
| **Rótulos em caixa alta com tracking** | Cria hierarquia no formulário sem aumentar o peso visual |
| **Tracking negativo em títulos** | Aperto sutil que diferencia título de corpo de texto |
| **Tema Dark com camadas reais de elevação** | Fundo, superfície e superfície elevada distintas, em vez de um cinza único |
| **`tabular-nums` em contadores** | Números não "dançam" enquanto a busca filtra |

### Responsividade

Quatro faixas — desktop (1180px máx.), notebook (≤1200px), tablet (≤900px) e celular (≤640px), mais um ajuste em ≤380px onde as ações do card ganham a linha inteira. Os breakpoints alteram **grid e densidade**, não regras duplicadas.

### Validação executada

- ✅ **52 classes** verificadas: todas as usadas por `Index/Home/Cadastro.html` e geradas dinamicamente pelo `Script.html` existem no novo CSS
- ✅ Seletores `#filtro-categoria`, `#toasts` e `#print-area` preservados
- ✅ Regra `[hidden] { display: none !important; }` preservada (a correção do modal não regride)
- ✅ Os 3 temas presentes e mapeados
- ✅ **74 variáveis definidas / 72 usadas** — nenhuma referência órfã
- ✅ Regras de impressão, `prefers-reduced-motion` e `-webkit-line-clamp` preservadas
- ✅ Chaves balanceadas

### Compatibilidade

Nenhuma alteração em dados, planilha, IDs, favoritos, cache, busca ou impressão. O sistema se comporta exatamente igual — apenas com aparência diferente.


---

## 10. Fase 2 — Executada ✅

**Arquivos alterados:** `Database.gs`, `Utils.gs`, `Home.html`, `Cadastro.html`, `Script.html`, `Style.html`.

### Estratégia de compatibilidade

A coluna `Subcategoria` entra como **coluna H**, ao final, e só é criada quando a célula H1 está vazia. Nenhuma coluna existente é renomeada, movida ou redimensionada; nenhuma linha de dados é reescrita.

Casos cobertos:

| Cenário | Comportamento |
|---|---|
| Base de 7 colunas com registros | Cabeçalho H1 criado; registros carregam com subcategoria vazia |
| Planilha estreita (colunas removidas) | `insertColumnsAfter` acrescenta o espaço necessário |
| Registro sem subcategoria | Continua válido — o campo é **opcional** |
| Leitura | `Math.min(DB_CABECALHO.length, getMaxColumns())` evita pedir coluna inexistente |

Nenhuma migração obrigatória: a equipe classifica os registros aos poucos, na edição normal.

### Interface

- **Filtros em cascata:** o select de subcategoria fica desabilitado até uma categoria ser escolhida e oferece apenas as subcategorias existentes dentro dela. Inclui a opção **"Sem subcategoria"** quando há registros não classificados.
- **Breadcrumb no card:** `Cartão de crédito › Cancelamento`. Registros sem subcategoria exibem apenas a categoria.
- **Formulário:** campos Categoria e Subcategoria lado a lado, com sugestões (`datalist`) da subcategoria **filtradas pela categoria digitada**, e prévia ao vivo do caminho `Categoria › Subcategoria › Descrição`.
- **Busca:** a subcategoria entrou no índice de pesquisa e recebe destaque do termo.
- **Sentinela:** a opção "Sem subcategoria" usa `\u0001` como valor, para nunca colidir com uma subcategoria real chamada "Geral".

### Correção adicional

**B-06 (novo achado):** `document.execCommand('copy')` podia lançar exceção em iframes restritos, e o erro escapava sem qualquer retorno ao usuário. Agora há tratamento e mensagem orientando o uso de Ctrl+C.

### Validação executada

- ✅ `node --check` no servidor e no cliente
- ✅ **18 verificações:** base legada de 7 colunas carrega intacta, coluna criada de forma aditiva, nenhuma linha reescrita, planilha estreita tratada, subcategoria gravada/editada/limpa em FAQ e Tabulações, campo opcional preservado, limite de 80 caracteres validado
- ✅ **Regressão:** sequência de IDs preservada (`FAQ-0009` → `FAQ-0010`), exclusão atingindo só o alvo
- ✅ CSS: 180 chaves balanceadas, regra `[hidden]` preservada, novas classes presentes
- ✅ Simulador: os 40 elementos referenciados pelo `Script.html` existem no DOM

### Entregável extra

`simulador.html` — executa o **código de produção do cliente** contra um servidor falso em memória, com 15 registros fictícios de operação bancária. Serve para validar comportamento antes de publicar no Apps Script.


---

## 11. Fase 3 — Executada ✅

**Arquivos alterados:** `Script.html`, `Home.html`, `Style.html`.

### P-01 — Índice de busca pré-computado

O gargalo não era a quantidade de registros: era o `destacar()`, que normalizava o texto **caractere a caractere** a cada tecla, para cada card visível.

Agora `indexar(registro)` roda **uma vez** por registro (no carregamento e ao criar/editar) e produz:

| Campo derivado | Uso |
|---|---|
| `_n.{campo}` | Versão normalizada e **alinhada por índice** com o original — permite destacar sem renormalizar |
| `_busca` | Concatenação dos 5 campos normalizados — o filtro faz um `includes` em vez de cinco |
| `_ts` | Timestamp pré-calculado — elimina o parse de data a cada comparação do `sort` |

**Medição (8 teclas × 400 registros de ~1.500 caracteres):**

```
antes:  923 ms
depois:   2 ms
```

### Busca com múltiplas palavras (AND implícito)

`cartao cancelamento` passa a exigir **as duas** palavras, em qualquer campo e em qualquer ordem. Todos os termos recebem destaque, e intervalos sobrepostos são fundidos para não gerar `<mark>` aninhado.

Sintaxe explícita de `OR`/`NOT` segue **fora de escopo**, conforme a avaliação da seção 3: atendente sob pressão não usa operadores, e a superfície de bug não compensa.

### P-03 — Atualização cirúrgica

Favoritar recriava os 400 cards da lista para trocar uma estrela. Agora só o card afetado é tocado.

**Efeito colateral desejável:** o card não "salta" de posição sob o cursor ao ser favoritado. A reordenação por favoritos passa a valer na próxima busca, filtro ou recarga — comportamento mais previsível para quem está no meio de um atendimento.

### Histórico de pesquisa

Últimas 8 buscas, salvas no `localStorage`, exibidas ao focar o campo vazio. Registradas apenas quando a busca é **confirmada** — Enter ou uso de um resultado (botão Copiar) — para não encher a lista de fragmentos como "car", "cart", "carta". Inclui ação de limpar.

### Validação executada

- ✅ `node --check` no cliente
- ✅ **22 verificações**, entre elas:
  - Alinhamento do índice preservado em acentuação, travessão, emoji e maiúsculas
  - Busca sem acento encontrando texto acentuado
  - Múltiplos termos destacados; todas as ocorrências marcadas; intervalos sobrepostos fundidos
  - **XSS neutralizado mesmo com destaque ativo** (`<img src=x onerror=...>` não escapa)
  - AND implícito entre campos diferentes, ordem das palavras irrelevante, espaços extras ignorados
  - Ordenação por `_ts` conferida
- ✅ Simulador reconstruído: 41 elementos referenciados, nenhum ausente

### Compatibilidade

Nenhuma alteração no servidor, na planilha ou no formato dos dados. Os campos `_n`, `_busca` e `_ts` existem **apenas no cache do navegador** e nunca são enviados de volta ao Apps Script.


---

## 12. Fase 4 — Executada ✅

**Arquivos alterados:** `Script.html`, `Home.html`, `Style.html`.

### Cor por categoria, sem cadastro

A cor sai de um **hash determinístico do nome da categoria**: nenhuma coluna nova na planilha, nenhuma tela de configuração, nenhum trabalho para a equipe. "Cartão de crédito" recebe o mesmo tom em qualquer navegador, hoje e daqui a um ano.

| Decisão | Motivo |
|---|---|
| Hash sobre o nome **normalizado** | "Cartão" e "cartao" caem na mesma cor |
| Matiz do JS, saturação/luminosidade do tema | A mesma categoria fica legível nos três temas — no dark, a luminosidade sobe para 64% |
| **Ponto colorido**, não a barra lateral | A barra lateral já codifica o **tipo** (FAQ/Tabulação). Dois significados na mesma marca visual seria ambíguo |
| 18 matizes espaçados em 20° | Com 10 tons, o paradoxo do aniversário deixava 10 categorias em ~6,5 cores. Com 18, medimos **9 de 10** |
| Etapa de avalanche no hash | Sem ela, "Cartão de crédito" e "Cartão de débito" caíam em tons vizinhos |

### Favoritos como eixo próprio

Novo botão **⭐ Favoritos** ao lado dos chips. Ele **não** é um quarto tipo: é um eixo independente que combina com tipo, categoria, subcategoria e busca — testado nas seis combinações. Acompanha contador próprio e um estado vazio específico ("Você ainda não favoritou nada"), em vez da mensagem genérica de filtro.

Cartões favoritados ganham borda na cor da própria categoria e estrela sempre visível.

### Bug encontrado durante a fase

A primeira versão do hash usava `hash ^= hash >>> 16` como etapa final. Operadores bitwise em JavaScript devolvem **int32 com sinal**, então valores acima de 2³¹ viravam negativos — e `MATIZES[índice negativo]` retornava `undefined`, deixando parte das categorias sem cor. O teste de dispersão expôs o problema (10 categorias → 6 tons, com `NaN` na comparação). Corrigido com `>>> 0` ao final de cada etapa.

### Correção de acessibilidade antecipada

Os chips usavam `role="tablist"` / `role="tab"` sem `aria-selected` e sem nenhum `tabpanel` associado — pior que não ter ARIA, porque o leitor de tela anuncia "aba" e procura um painel inexistente (achado AC-01). Trocado por `role="group"`. O botão de favoritos já nasceu com `aria-pressed`.

### Validação executada

- ✅ `node --check` no cliente
- ✅ **19 verificações:** determinismo, insensibilidade a acento/caixa, todos os valores dentro da paleta, dispersão de 9/10, estabilidade entre chamadas, categoria vazia tratada, nomes parecidos com tons distantes, seis combinações de filtros, integridade do marcador e dos tokens de tema
- ✅ Simulador reconstruído sem elementos ausentes


---

## 13. Fase 5 — Executada ✅

**Arquivos alterados:** `Index.html`, `Home.html`, `Cadastro.html`, `Script.html`, `Style.html`.

### Contraste — as falhas eram reais

Auditei os pares de cor dos três temas com a fórmula de contraste da WCAG 2.1, antes de tocar em qualquer valor. **7 falhas**, com o texto sutil (metadados dos cards, 11px) sendo a mais séria:

| Token | Tema | Antes | Depois |
|---|---|---|---|
| `--p-cinza-400` sobre superfície | portobank | ❌ 2,96:1 | ✅ 4,94:1 |
| `--p-cinza-400` sobre fundo | portobank | ❌ 2,78:1 | ✅ 4,65:1 |
| `--p-cinza-400` sobre superfície | rosa | ❌ 3,48:1 | ✅ 4,98:1 |
| `--p-cinza-400` sobre fundo | rosa | ❌ 3,25:1 | ✅ 4,66:1 |
| Borda de controle | os três | ❌ ~1,3:1 | ✅ ≥ 3,0:1 |

As cores novas foram **calculadas**, não estimadas: um solver ajusta a luminosidade preservando matiz e saturação até atingir o mínimo exigido, mantendo a identidade de cada tema.

Sobre as bordas: a WCAG 1.4.11 exige 3:1 para componentes de interface, mas **isenta elementos decorativos**. Por isso a distinção entre `--borda` (divisórias e contorno de card, sem exigência) e o novo `--borda-controle`, aplicado aos elementos com que se interage — campo de busca, selects de filtro, campos do formulário e botão de favoritos.

### AC-01 · Semântica dos controles
Chips e segmentado de tipo passaram a `role="group"` com `aria-pressed` sincronizado pelo JS. Antes o leitor de tela anunciava "aba" e procurava um painel inexistente.

### AC-02 · Gestão de foco do modal
Foco preso no diálogo (Tab e Shift+Tab circulam entre os botões), foco inicial no botão de ação e **devolução ao elemento que abriu** — com verificação de que ele ainda existe no DOM, já que o card pode ter sido excluído.

### AC-03 · Nomes acessíveis
Os botões de ícone tinham apenas `title`, que leitores de tela ignoram. Agora cada um tem `aria-label` **contextualizado com o registro** — "Excluir Cliente quer cancelar por causa da anuidade", não "Excluir". O emoji do botão Copiar recebeu `aria-hidden`, e o "Ver mais" ganhou `aria-expanded`.

### AC-04 · Anúncios dinâmicos
Contadores e resultados em `role="status"` + `aria-live="polite"`: a contagem passa a ser anunciada conforme a busca filtra. Skeleton identificado como "Carregando registros".

### Validação de formulário acessível
O toast de erro não dizia **qual** campo falhou. Agora cada campo tem mensagem própria com `role="alert"`, ligada por `aria-describedby`, com `aria-invalid` no campo e limpeza entre tentativas. O campo inválido ganhou borda de 2px além da cor vermelha — WCAG 1.4.1 proíbe usar cor como único indicador.

### Navegação por teclado
Link "Pular para o conteúdo" visível apenas ao receber foco, e `Esc` com ordem de precedência clara: fecha o histórico, depois o modal, depois o formulário.

### Validação executada

- ✅ `node --check` no cliente
- ✅ **30 pares de contraste** reauditados nos 3 temas — nenhuma falha
- ✅ **40 verificações** de acessibilidade e regressão


---

## 14. Fase 6 — Executada ✅

**Arquivos alterados:** `Script.html`, `Home.html`, `Style.html`.

### Pílulas de hierarquia

O caminho deixou de ser texto cinza de 12px e virou dois objetos visuais: **categoria como pílula cheia** na cor derivada do nome (reaproveitando o hash da Fase 4) e **subcategoria como pílula de contorno**, na mesma família cromática. Dois níveis distinguíveis sem precisar ler.

Os tokens foram **calculados**, não escolhidos a olho. Uma busca varreu combinações de saturação e luminosidade exigindo, simultaneamente, para os **18 matizes da paleta**:

| Critério | Mínimo | Resultado |
|---|---|---|
| Texto da pílula sobre o próprio fundo | 4,5:1 (WCAG AA) | 6,74:1 (claro) · 4,56:1 (escuro) |
| Fundo da pílula sobre o card | 1,18:1 (visível como forma) | 1,26:1 (claro) · 1,22:1 (escuro) |

A primeira tentativa passava no texto (5,35:1) mas falhava na forma (**1,06:1**) — a pílula seria invisível sobre o card branco. Só a verificação dos dois critérios juntos expôs o problema.

### Agrupamento com navegação de nível

A lista passa a ser agrupada por categoria, com cabeçalho fixo ao rolar, marca colorida e contagem por grupo.

Duas decisões de comportamento:

1. **Com uma categoria filtrada, o agrupamento desce um nível** e passa a agrupar por subcategoria. Agrupar por algo que já é o filtro seria redundante — assim a hierarquia vira navegação de verdade.
2. **Durante a busca a lista fica plana.** Quem pesquisa quer o resultado, não a gaveta em que ele mora; o agrupamento voltaria a esconder o que a busca acabou de encontrar.

Grupos em ordem alfabética com `localeCompare('pt-BR')` — "Ávila" antes de "Cartão" —, e o grupo "Sem categoria"/"Sem subcategoria" sempre no fim.

### Limpar filtros

Botão em dois lugares: na barra de contadores (visível apenas quando há algo a limpar) e no estado vazio, que é justamente onde o usuário percebe que filtrou demais. Ambos zeram os **cinco eixos** — busca, tipo, categoria, subcategoria e favoritos — e ressincronizam campo de busca, `aria-pressed` dos chips, ícone do botão de favoritos e o select de subcategoria.

### Validação executada

- ✅ `node --check` no cliente
- ✅ **35 verificações:** agrupamento por categoria e por subcategoria, ordem alfabética com acento, grupo sem classificação no fim, nenhum registro perdido no agrupamento, sete cenários de estado de filtro, sincronização completa do limpar, integridade das pílulas e regressão de CSS
- ✅ Contraste das pílulas verificado nos 18 matizes × 2 esquemas
- ✅ Simulador reconstruído sem elementos ausentes


---

## 15. Fase 7 — Executada ✅

**Arquivos:** novo `Dashboard.html`; alterados `Index.html`, `Script.html`, `Style.html`.

### Custo zero de servidor

Todos os indicadores saem do **cache já carregado**. Abrir a tela não dispara nenhuma chamada ao Apps Script — o que importa numa plataforma com cota de execução.

### O que mostra

| Bloco | Conteúdo |
|---|---|
| Números principais | FAQs, Tabulações, categorias, subcategorias e favoritos |
| Registros por categoria | Ranking com barra proporcional e divisão FAQ/Tabulação |
| Subcategorias mais usadas | Mesmo formato, um nível abaixo |
| Quem mais cadastra | Ranking por autor |
| Últimas alterações | Os 5 registros mexidos mais recentemente |
| Pendente de classificação | Quantos registros ainda não têm subcategoria, com percentual |

### Indicadores que levam a algum lugar

Cada barra é clicável e **devolve o usuário à lista já filtrada**. Clicar em "Cancelamento" nas subcategorias descobre a categoria pai, aplica os dois níveis de filtro e volta para a home — o dashboard vira ponto de partida, não um painel decorativo.

O bloco "Pendente de classificação" leva direto ao filtro **Sem subcategoria**, transformando o número numa fila de trabalho. Ele só aparece quando há algo pendente.

### Gráficos sem biblioteca

Barras são `div`s com largura percentual, respeitando a restrição de não usar bibliotecas externas. Cada linha é um **botão com `aria-label` completo** ("Cartão de crédito: 3 registros (2 FAQ, 1 tabulação)") e o trilho visual leva `aria-hidden` — o leitor de tela recebe o dado, não a forma.

### C-02 corrigido de quebra

A terceira tela tornou insustentável manipular `hidden` em quatro pontos do código. Criei o roteador `irPara(tela)` com o mapa `TELAS`, eliminando o risco de duas telas visíveis ao mesmo tempo. O `limparFiltros` também foi refatorado: a versão silenciosa é reaproveitada pelos drill-downs, sem duplicar a lógica de sincronização.

### Bug encontrado no teste

O contador de favoritos usava o tamanho do `Set`, que pode conter IDs de registros já excluídos (o `localStorage` sobrevive à exclusão). Passou a contar apenas favoritos que existem na base.

### Validação executada

- ✅ `node --check` no cliente
- ✅ **38 verificações:** totais consistentes, favoritos órfãos ignorados, ordenação por volume com desempate alfabético, subcategorias vazias excluídas dos rankings, última alteração correta, recentes limitados e ordenados, **base vazia sem quebrar**, contêineres presentes, acessibilidade das barras e drill-downs
- ✅ Simulador reconstruído sem elementos ausentes


---

## 16. Fase 8 — Executada ✅

**Arquivos:** novo `Config.html`; alterados `Index.html`, `Script.html`, `Style.html`.

### Preferências disponíveis

| Preferência | Opções | Padrão |
|---|---|---|
| Tema | PortoBank · Rosa · Dark | PortoBank |
| Densidade | Confortável · Compacta | Confortável |
| Linhas visíveis no card | 3 · 4 · 8 | 4 |
| Animações | Ligadas · Reduzidas | Ligadas |
| Agrupar por categoria | Sim · Não | Sim |
| Sugerir buscas recentes | Sim · Não | Sim |

Somam-se a isso o resumo do que está guardado no navegador, a lista de atalhos e três ações locais: limpar histórico, limpar favoritos e restaurar padrões.

### Densidade sem reescrever componentes

`html[data-densidade="compacta"]` **redefine a escala de espaçamento** (`--e-3` a `--e-12`). Como todo o CSS já consumia esses tokens desde a Fase 1, a interface inteira encolhe de forma proporcional sem nenhuma regra específica por componente. É o retorno prático do investimento em design tokens.

O mesmo vale para as linhas do card: `-webkit-line-clamp: var(--linhas-card, 4)`.

### O ciclador de tema saiu da topbar

O botão 🎨 alternava entre os três temas em sequência — divertido, mas o tema é escolhido uma vez e nunca mais. Ele deu lugar a **⚙️ Configurações**, com seleção explícita e amostra visual de cada esquema. A topbar não cresceu e a escolha ficou mais clara.

### Migração silenciosa

Versões anteriores guardavam o tema em `bc_tema`. A nova estrutura usa `bc_prefs`, mas a chave antiga continua sendo lida quando não há preferência nova — quem já usava o sistema não perde o tema escolhido. Testado nos dois sentidos, incluindo precedência.

### Validação executada

- ✅ `node --check` no cliente
- ✅ **34 verificações**, com destaque para os casos de robustez:
  - `bc_prefs` com **JSON corrompido** → cai nos padrões sem quebrar
  - Tema **inválido** salvo → volta ao padrão
  - Chave **desconhecida** no JSON → ignorada (não polui o estado)
  - **`localStorage` bloqueado** (modo restrito/privado) → sistema continua funcionando
  - Migração de `bc_tema` e precedência de `bc_prefs`
- ✅ Nenhuma referência órfã ao botão removido
- ✅ Simulador reconstruído sem elementos ausentes

### Segurança do simulador

Os e-mails fictícios passaram de `@portobank.com` para **`@teste.test`**. O TLD `.test` é reservado pela RFC 2606 e **nunca pode ser registrado**, então nenhuma mensagem enviada a esses endereços chega a lugar algum — nem ao domínio corporativo real.


---

## 17. Fase 9 — Executada ✅

**Arquivos alterados:** `Database.gs`, `Script.html`, `Home.html`, `Config.html`, `Style.html`.

### A-03 · Lixeira em vez de exclusão definitiva

Excluir passou a **mover a linha para uma aba nova `LIXEIRA`**, com três colunas de rastro: origem (FAQ/TAB), quem excluiu e quando. As abas `FAQ` e `TABULAÇÕES` não mudam de estrutura, nenhuma coluna é renomeada e instalações antigas não precisam de migração — a aba é criada sob demanda, na primeira exclusão.

Duas funções novas no servidor: `listarLixeira(limite)` e `restaurarRegistro(id)`. A restauração **preserva o ID e as datas originais** e é recusada quando já existe um registro ativo com aquele ID, em vez de gerar duplicidade silenciosa.

Na interface, um bloco **Lixeira** em Configurações, carregado sob demanda (a tela principal continua fazendo uma única leitura).

### B-03 · Revalidação do cache

Os dados eram lidos uma vez por sessão, então dois atendentes não viam os cadastros um do outro até recarregar — origem de cadastro duplicado e uso de texto desatualizado.

| Gatilho | Comportamento |
|---|---|
| Botão **↻ Atualizar** | Releitura imediata, com ícone girando |
| Volta para a aba | Revalidação automática, só na home e só após 5 minutos da última leitura |

A revalidação **compara o antes e o depois** e avisa o que mudou ("Base atualizada: 3 novos e 1 removido"). A automática é silenciosa quando nada mudou e quando falha — não faz sentido interromper um atendimento com erro de uma checagem que o usuário nem pediu.

### P-04 · Renderização incremental

Primeiro lote de **60 cards**; os seguintes entram conforme a rolagem, via `IntersectionObserver` com margem de 300px (o lote carrega antes de o usuário chegar ao fim). Navegadores sem suporte caem em um fallback por clique.

O controle é uma **assinatura dos filtros**: quando busca ou filtro mudam, a lista volta ao primeiro lote; quando o usuário apenas rola, o limite cresce sem reiniciar. Sem isso, filtrar depois de rolar muito manteria centenas de cards no DOM sem necessidade.

Mantida a decisão da auditoria de **não usar virtualização**: ela quebraria Ctrl+F e a impressão, com muito mais código.

### Validação executada

- ✅ `node --check` no servidor e no cliente
- ✅ **38 verificações**, com destaque para o ciclo completo da lixeira:
  - Exclusão preserva texto, subcategoria, origem, autor e data
  - `getAllRecords` **não enxerga** a lixeira
  - Restauração devolve à aba certa (testado em FAQ e Tabulação), com ID e datas originais
  - Restauração sobre ID em uso é **recusada** e o registro permanece na lixeira
  - Lixeira vazia e IDs inválidos tratados
  - Renderização: primeiro lote, ampliação por rolagem, reset ao mudar a busca, resultado menor que o lote
  - Revalidação: reentrância bloqueada, comparação antes/depois, restrições de tela e intervalo
- ✅ Simulador atualizado com lixeira funcional

---

## 18. Situação final

As 10 fases do plano foram executadas. Dos 19 achados da auditoria inicial, **todos os de severidade crítica, alta e média foram corrigidos**, além dos dois requisitos incorporados no caminho (R-01 e R-02).

| Achado | Situação |
|---|---|
| A-01 · Perda de acesso à base | ✅ Fase 0 |
| A-02 · Cabeçalho sobrescrito | ✅ Fase 0 |
| A-03 · Exclusão sem rastro | ✅ Fase 9 |
| B-01 · Filtro fantasma | ✅ Fase 0 |
| B-02 · Sem timeout | ✅ Fase 0 |
| B-03 · Cache sem revalidação | ✅ Fase 9 |
| B-06 · Cópia sem retorno | ✅ Fase 2 |
| P-01 · Custo da busca | ✅ Fase 3 (~460×) |
| P-03 · Re-render total | ✅ Fase 3 |
| P-04 · Lista sem limite | ✅ Fase 9 |
| AC-01 a AC-04 · Acessibilidade | ✅ Fases 4 e 5 |
| Contraste WCAG | ✅ Fase 5 |
| C-02 · Navegação espalhada | ✅ Fase 7 |
| C-03/C-04 · Tokens e espaçamento | ✅ Fase 1 |
| R-01 · Hierarquia | ✅ Fase 2 |
| R-02 · Hierarquia evidente | ✅ Fase 6 |

**Pendências conhecidas** (baixa severidade, registradas para acompanhamento): B-04 (conteúdo residual em `#print-area`), B-05 (fila de toasts sem limite), C-01 (separação UI/lógica no `Script.html`), C-05 (cor institucional duplicada) e C-06 (`localizarLinha_` linear).

**P-02 (payload único)** segue sem ação por decisão consciente: só passa a valer a pena acima de alguns milhares de registros, e a renderização incremental já resolve o lado do navegador.
