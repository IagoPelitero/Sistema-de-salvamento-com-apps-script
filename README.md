# 📚 Base de Conhecimento — Google Apps Script + Google Sheets

Sistema web para centralizar **FAQs** e **Tabulações** utilizadas por atendentes, construído 100% com **Google Apps Script**, **HTML Service** e **Google Sheets** como banco de dados.

Rápido, responsivo e sem dependências externas — funciona no desktop e no celular, sem custo de hospedagem.

---

## ✨ Funcionalidades

- 🗂️ **Hierarquia em 3 níveis** — `Cartão de crédito › Cancelamento › Qual motivo?`, para FAQs e Tabulações
- 🔍 **Pesquisa em tempo real** — resultados enquanto você digita, sem botão de pesquisar
- 🔤 **Busca sem acentos** — pesquisar `cartao` encontra "Cartão", com destaque do termo nos resultados
- 🧩 **Várias palavras filtram por todas elas** — `cartao cancelamento` exige as duas, em qualquer campo e ordem
- 🕐 **Histórico de pesquisa** — as últimas 8 buscas, ao focar o campo vazio
- 📋 **Copiar com um clique** — texto enviado direto para a área de transferência
- ➕ **Cadastro e edição** de FAQs e Tabulações em formulário simples
- 🗑️ **Exclusão com lixeira** — o registro vai para a aba `LIXEIRA` com autor e data, e pode ser restaurado
- ↻ **Atualização de dados** — busca cadastros feitos por colegas sem recarregar a página
- ⭐ **Favoritos** — salvos no navegador, exibidos no topo da lista e com filtro próprio
- 🎨 **Cor automática por categoria** — tom estável derivado do nome, sem cadastro nem coluna extra
- 🏷️ **Filtros rápidos** — Todos / FAQs / Tabulações + filtros em cascata por categoria e subcategoria, com **limpar filtros** a um clique
- 📊 **Indicadores** — totais, rankings por categoria/subcategoria/autor e pendências, calculados sem chamar o servidor
- 📚 **Lista agrupada por categoria** — cabeçalho fixo ao rolar; com uma categoria filtrada, agrupa por subcategoria
- 📊 **Contadores** de FAQs e Tabulações no topo da tela
- 📖 **Ver mais / Ver menos** para textos longos
- 🖨️ **Impressão / exportação em PDF** de qualquer registro individual
- 🕐 **Histórico de edição** — data de criação e última alteração em cada card
- ⌨️ **Atalhos de teclado** — `Ctrl + K` (busca) · `Ctrl + N` (novo cadastro) · `Esc` (voltar/fechar)
- ♿ **Acessibilidade** — contraste WCAG AA nos 3 temas, navegação completa por teclado, nomes acessíveis e anúncios para leitores de tela
- 🎨 **3 temas** — PortoBank (azul), Rosa e Dark, escolhidos em Configurações
- ⚙️ **Preferências** — densidade, linhas visíveis no card, animações, agrupamento e sugestões de busca
- 📱 **Layout responsivo** — grid de cards no desktop, coluna única no celular

---

## 🏗️ Arquitetura

```
├── Code.gs          → Ponto de entrada do Web App (doGet + include)
├── Database.gs      → Camada de dados: CRUD no Google Sheets
├── Utils.gs         → Utilitários: IDs sequenciais, datas BR, validação
├── Index.html       → Shell da aplicação (menu, modal, toasts, includes)
├── Home.html        → Tela principal (busca, filtros, lista de cards)
├── Cadastro.html    → Tela de cadastro/edição
├── Dashboard.html   → Tela de indicadores
├── Config.html      → Tela de configurações
├── Style.html       → CSS completo: design tokens + 3 temas
└── Script.html      → Lógica do cliente (ES6+, sem bibliotecas)

Documentação e apoio (não fazem parte do deploy):
├── AUDITORIA.md     → Auditoria técnica e registro das fases executadas
└── simulador.html   → Executa o cliente real contra um servidor em memória
```

### Simulador

Abra `simulador.html` em qualquer navegador para testar o sistema sem publicar nada. Ele roda o **código de produção do cliente**, com dados fictícios em memória — útil para validar alterações antes do deploy.

### Fluxo de dados

```
Navegador (cache em memória)
      │
      │  1 única chamada no carregamento (getAllRecords)
      ▼
google.script.run  ◄──►  Database.gs  ◄──►  Google Sheets
```

- Os dados são carregados **uma única vez** ao abrir o sistema.
- Busca, filtros e ordenação rodam **100% no navegador** (cache local).
- Após salvar/editar/excluir, apenas o cache é atualizado com a resposta do servidor — **sem recarregar a página** e sem reler a planilha inteira.
- Escritas protegidas por `LockService` contra conflitos entre usuários simultâneos.

---

## 🗄️ Banco de Dados

A planilha **"Base de Conhecimento — Dados"** é criada **automaticamente** no Google Drive na primeira execução (o ID fica salvo em `ScriptProperties`). Se o arquivo for excluído, o sistema recria sozinho.

### Abas

| Aba | Prefixo do ID | Exemplo |
|---|---|---|
| `FAQ` | `FAQ-` | FAQ-0001, FAQ-0002… |
| `TABULAÇÕES` | `TAB-` | TAB-0001, TAB-0002… |
| `LIXEIRA` | — | Excluídos, com origem, autor e data |

### Colunas (ambas as abas)

| Coluna | Descrição |
|---|---|
| ID | Sequencial automático por tipo |
| Categoria | 1º nível da hierarquia (ex.: Cartão de crédito) |
| Descrição/Cenário | 3º nível — quando o conteúdo deve ser usado |
| Texto | Conteúdo completo copiado pelo atendente |
| Criado por | E-mail via `Session.getActiveUser().getEmail()` |
| Data criação | `dd/MM/yyyy HH:mm` (fuso America/Sao_Paulo) |
| Última alteração | Atualizada a cada edição |
| Subcategoria (H) | 2º nível da hierarquia — **opcional**, acrescentada ao final |

> As colunas de data usam formato **texto** (`@`) na planilha, evitando conversão automática do Sheets e deslocamento de fuso horário na leitura.

### Hierarquia

```
Cartão de crédito  ›  Cancelamento  ›  Qual motivo?
   Categoria           Subcategoria      Descrição/Cenário
```

A coluna `Subcategoria` é **aditiva**: entra ao final, só é criada quando a célula H1 está vazia, e registros anteriores continuam válidos com o campo em branco. **Não há migração obrigatória** — a classificação pode ser feita aos poucos, na edição do dia a dia.

---

## 🚀 Instalação

### 1. Criar o projeto

1. Acesse [script.google.com](https://script.google.com) e crie um **Novo projeto**.
2. Renomeie o projeto (ex.: *Base de Conhecimento*).

### 2. Adicionar os arquivos

Crie cada arquivo no editor com o **nome exato** (sem extensão no nome — o editor adiciona `.gs`/`.html` automaticamente):

| No editor | Tipo | Conteúdo |
|---|---|---|
| `Code` | Script | `Code.gs` |
| `Database` | Script | `Database.gs` |
| `Utils` | Script | `Utils.gs` |
| `Index` | HTML | `Index.html` |
| `Home` | HTML | `Home.html` |
| `Cadastro` | HTML | `Cadastro.html` |
| `Dashboard` | HTML | `Dashboard.html` |
| `Config` | HTML | `Config.html` |
| `Style` | HTML | `Style.html` |
| `Script` | HTML | `Script.html` |

### 3. Configurar o fuso horário

Em **Configurações do projeto** (⚙️) → **Fuso horário** → `(GMT-03:00) São Paulo`.

### 4. Publicar

1. **Implantar** → **Nova implantação** → tipo **App da Web**.
2. **Executar como:** Eu (sua conta).
3. **Quem pode acessar:** *Qualquer pessoa na organização* — necessário para o campo "Criado por" ser preenchido com o e-mail do usuário.
4. Autorize as permissões solicitadas na primeira execução.
5. Copie a URL gerada e compartilhe com a equipe. ✅

> **Atualizações:** após alterar o código, use **Implantar → Gerenciar implantações → ✏️ → Nova versão** para publicar na mesma URL.

---

## 🖥️ Uso

| Ação | Como fazer |
|---|---|
| Pesquisar | Digite no campo de busca (ou `Ctrl + K`) — busca em categoria, descrição, texto e autor |
| Filtrar por tipo | Chips **Todos / FAQs / Tabulações** |
| Filtrar por categoria | Seletor ao lado dos chips |
| Filtrar por subcategoria | Segundo seletor — habilita ao escolher uma categoria |
| Limpar todos os filtros | Botão **✕ Limpar filtros**, ao lado dos contadores |
| Buscar por várias palavras | Separe por espaço: `cartao cancelamento` exige as duas |
| Ver buscas recentes | Clique no campo de busca vazio |
| Copiar texto | Botão **📋 Copiar** no card |
| Novo cadastro | Botão **➕ Novo Cadastro** (ou `Ctrl + N`) |
| Editar | Botão **✏️** no card (o tipo não pode ser alterado na edição) |
| Excluir | Botão **🗑️** → confirmação obrigatória |
| Favoritar | Botão **☆/⭐** — favoritos aparecem primeiro |
| Imprimir / PDF | Botão **🖨️** no card |
| Ver indicadores | Botão **📊 Indicadores** no menu — clique nas barras para filtrar a lista |
| Trocar tema e preferências | Botão **⚙️ Configurações** no menu |

---

## 🎨 Temas

| Tema | Paleta |
|---|---|
| **PortoBank** (padrão) | Azul institucional `#0047BB` · branco · cinza claro |
| **Rosa** | Rosa `#D6336C` · branco · cinza |
| **Dark** | Fundo escuro `#0F141C` · cards escuros · texto branco · azul `#4D8DFF` |

O tema escolhido fica salvo no `localStorage` do navegador. Cards de **FAQ** têm identificação azul; **Tabulações**, verde.

---

## ⚡ Performance

- **1 chamada ao servidor** por sessão para leitura — todo o resto é cache local
- **Renderização incremental**: 60 cards por lote, com os seguintes carregando na rolagem
- **Índice de busca pré-computado**: a normalização de acentos acontece uma vez por registro, no carregamento. Durante a digitação sobra apenas `indexOf` — medido em ~460× mais rápido que normalizar a cada tecla
- **Atualização cirúrgica**: favoritar ou expandir um card não redesenha a lista inteira
- Renderização por *string building* + delegação de eventos
- Busca com *debounce* de 120 ms para digitação sem travamentos
- Sem jQuery, sem frameworks, sem CDNs — apenas JavaScript moderno (ES6+)

---

## 🔒 Observações

- **Não há login nem controle de permissões** — qualquer pessoa com acesso à URL pode visualizar, cadastrar, editar e excluir (por desenho).
- Favoritos, preferências e histórico de pesquisa são **por navegador** (localStorage), não sincronizados entre dispositivos.
- O `simulador.html` usa e-mails fictícios no domínio `@teste.test`, reservado pela RFC 2606 e impossível de registrar.
- A base de dados **nunca é recriada automaticamente** quando já existe um ID registrado. Se a planilha for realmente excluída, execute `recriarBaseDeDados()` manualmente no editor do Apps Script.
- Concorrência de escrita é tratada com `LockService` (timeout de 10 s com mensagem amigável).

---

## 🛠️ Tecnologias

![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-4285F4?logo=google&logoColor=white)
![Google Sheets](https://img.shields.io/badge/Google%20Sheets-34A853?logo=googlesheets&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)

---

## 📄 Licença

Uso interno / livre adaptação. Sinta-se à vontade para clonar e customizar.
