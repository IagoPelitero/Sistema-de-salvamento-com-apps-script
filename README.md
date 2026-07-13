# 📚 Base de Conhecimento — Google Apps Script + Google Sheets

Sistema web para centralizar **FAQs** e **Tabulações** utilizadas por atendentes, construído 100% com **Google Apps Script**, **HTML Service** e **Google Sheets** como banco de dados.

Rápido, responsivo e sem dependências externas — funciona no desktop e no celular, sem custo de hospedagem.

---

## ✨ Funcionalidades

- 🔍 **Pesquisa em tempo real** — resultados enquanto você digita, sem botão de pesquisar
- 🔤 **Busca sem acentos** — pesquisar `cartao` encontra "Cartão", com destaque do termo nos resultados
- 📋 **Copiar com um clique** — texto enviado direto para a área de transferência
- ➕ **Cadastro e edição** de FAQs e Tabulações em formulário simples
- 🗑️ **Exclusão** com modal de confirmação
- ⭐ **Favoritos** — salvos no navegador e exibidos sempre no topo da lista
- 🏷️ **Filtros rápidos** — Todos / FAQs / Tabulações + filtro por categoria
- 📊 **Contadores** de FAQs e Tabulações no topo da tela
- 📖 **Ver mais / Ver menos** para textos longos
- 🖨️ **Impressão / exportação em PDF** de qualquer registro individual
- 🕐 **Histórico de edição** — data de criação e última alteração em cada card
- ⌨️ **Atalhos de teclado** — `Ctrl + K` (busca) · `Ctrl + N` (novo cadastro) · `Esc` (voltar/fechar)
- 🎨 **3 temas** — PortoBank (azul), Rosa e Dark, com preferência salva no navegador
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
├── Style.html       → CSS completo com os 3 temas (variáveis CSS)
└── Script.html      → Lógica do cliente (ES6+, sem bibliotecas)
```

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

### Colunas (ambas as abas)

| Coluna | Descrição |
|---|---|
| ID | Sequencial automático por tipo |
| Categoria | Agrupador do conteúdo (ex.: Cartão, Conta) |
| Descrição/Cenário | Quando o conteúdo deve ser usado |
| Texto | Conteúdo completo copiado pelo atendente |
| Criado por | E-mail via `Session.getActiveUser().getEmail()` |
| Data criação | `dd/MM/yyyy HH:mm` (fuso America/Sao_Paulo) |
| Última alteração | Atualizada a cada edição |

> As colunas de data usam formato **texto** (`@`) na planilha, evitando conversão automática do Sheets e deslocamento de fuso horário na leitura.

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
| Copiar texto | Botão **📋 Copiar** no card |
| Novo cadastro | Botão **➕ Novo Cadastro** (ou `Ctrl + N`) |
| Editar | Botão **✏️** no card (o tipo não pode ser alterado na edição) |
| Excluir | Botão **🗑️** → confirmação obrigatória |
| Favoritar | Botão **☆/⭐** — favoritos aparecem primeiro |
| Imprimir / PDF | Botão **🖨️** no card |
| Trocar tema | Botão **🎨 Tema** no menu (PortoBank → Rosa → Dark) |

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
- Renderização por *string building* + delegação de eventos (uma lista com milhares de registros continua fluida)
- Busca com *debounce* de 120 ms para digitação sem travamentos
- Sem jQuery, sem frameworks, sem CDNs — apenas JavaScript moderno (ES6+)

---

## 🔒 Observações

- **Não há login nem controle de permissões** — qualquer pessoa com acesso à URL pode visualizar, cadastrar, editar e excluir (por desenho).
- Favoritos e tema são **por navegador** (localStorage), não sincronizados entre dispositivos.
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
