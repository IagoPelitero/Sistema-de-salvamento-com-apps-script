/**
 * ============================================================
 * BASE DE CONHECIMENTO — Database.gs
 * Camada de dados: Google Sheets como banco.
 * Cria a planilha automaticamente na primeira execução.
 * API pública (chamada via google.script.run):
 *   - getAllRecords()
 *   - createRecord(dados)
 *   - updateRecord(dados)
 *   - deleteRecord(id)
 * ============================================================
 */

/** Chave em ScriptProperties onde fica o ID da planilha-banco. */
var DB_PROP_KEY = 'BC_SPREADSHEET_ID';

/**
 * Chave de backup. Sempre que a base é trocada, o ID anterior é
 * preservado aqui — permite recuperar manualmente a planilha antiga.
 */
var DB_PROP_BACKUP = 'BC_SPREADSHEET_ID_ANTERIOR';

/** Nome do arquivo criado no Drive na primeira execução. */
var DB_NOME_ARQUIVO = 'Base de Conhecimento — Dados';

/** Cabeçalho padrão das duas abas. */
var DB_CABECALHO = [
  'ID', 'Categoria', 'Descrição/Cenário', 'Texto',
  'Criado por', 'Data criação', 'Última alteração',
  'Subcategoria'   // coluna H — acrescentada na Fase 2
];

/** Posição (1-indexada) da coluna Subcategoria. */
var DB_COL_SUBCATEGORIA = 8;

/** Configuração das abas por tipo de registro. */
var DB_ABAS = {
  FAQ: { nome: 'FAQ', prefixo: 'FAQ' },
  TAB: { nome: 'TABULAÇÕES', prefixo: 'TAB' }
};

/* ------------------------------------------------------------
 * Infraestrutura
 * ---------------------------------------------------------- */

/**
 * Obtém a planilha-banco.
 *
 * REGRA DE SEGURANÇA (correção A-01):
 * a base só é criada automaticamente quando NÃO existe nenhum ID
 * registrado (primeira execução). Se já existe um ID e a abertura
 * falha, o erro é propagado — nunca se cria uma planilha nova por
 * cima, pois a falha pode ser transitória (quota do Drive,
 * instabilidade, permissão temporária) e isso faria o sistema
 * abandonar silenciosamente a base de produção.
 *
 * @returns {Spreadsheet}
 */
function obterPlanilha_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(DB_PROP_KEY);

  // Primeira execução: não há base registrada, criar é seguro.
  if (!id) return criarBase_(props);

  try {
    return SpreadsheetApp.openById(id);
  } catch (e1) {
    // Segunda tentativa: cobre falhas transitórias do Drive.
    Utilities.sleep(700);
    try {
      return SpreadsheetApp.openById(id);
    } catch (e2) {
      throw new Error(
        'Não foi possível abrir a planilha de dados (ID: ' + id + '). ' +
        'A base NÃO foi recriada, para não perder o acesso aos registros existentes. ' +
        'Verifique no Google Drive se o arquivo existe e se a conta tem permissão de acesso. ' +
        'Caso a planilha tenha sido realmente excluída, execute manualmente a função ' +
        'recriarBaseDeDados() no editor do Apps Script. ' +
        'Detalhe técnico: ' + e2.message
      );
    }
  }
}

/**
 * Cria uma nova planilha-banco e registra seu ID.
 * O ID anterior (se houver) é preservado em DB_PROP_BACKUP.
 * @param {Properties} props - ScriptProperties.
 * @returns {Spreadsheet}
 */
function criarBase_(props) {
  var anterior = props.getProperty(DB_PROP_KEY);
  var ss = SpreadsheetApp.create(DB_NOME_ARQUIVO);

  if (anterior) props.setProperty(DB_PROP_BACKUP, anterior);
  props.setProperty(DB_PROP_KEY, ss.getId());

  prepararPlanilhaNova_(ss);
  return ss;
}

/**
 * Função administrativa. Executar MANUALMENTE no editor do Apps Script
 * apenas quando a planilha original tiver sido realmente excluída.
 * O ID antigo fica guardado em DB_PROP_BACKUP.
 * @returns {string} URL da nova planilha.
 */
function recriarBaseDeDados() {
  var props = PropertiesService.getScriptProperties();
  var anterior = props.getProperty(DB_PROP_KEY);
  var ss = criarBase_(props);

  Logger.log('Nova base criada: ' + ss.getUrl());
  if (anterior) {
    Logger.log('ID anterior preservado em ' + DB_PROP_BACKUP + ': ' + anterior);
  }
  return ss.getUrl();
}

/**
 * Configuração inicial de uma planilha recém-criada.
 * Só é chamada na criação — nunca sobre uma base existente.
 * @param {Spreadsheet} ss
 */
function prepararPlanilhaNova_(ss) {
  var chaves = ['FAQ', 'TAB'];
  for (var i = 0; i < chaves.length; i++) {
    var cfg = DB_ABAS[chaves[i]];
    var aba = ss.getSheetByName(cfg.nome) || ss.insertSheet(cfg.nome);
    escreverCabecalho_(aba);
  }

  // Remove a aba padrão vazia criada pelo Sheets.
  var padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (padrao && ss.getSheets().length > 2) ss.deleteSheet(padrao);
}

/**
 * Escreve e formata a linha de cabeçalho de uma aba.
 *
 * CORREÇÃO A-02: nunca sobrescreve o cabeçalho de uma aba que já
 * contém dados. Antes, qualquer chamada reescrevia o cabeçalho das
 * duas abas, revertendo ajustes feitos na planilha de produção.
 *
 * @param {Sheet} aba
 */
function escreverCabecalho_(aba) {
  if (aba.getLastRow() > 0) return; // aba já em uso — não tocar

  aba.getRange(1, 1, 1, DB_CABECALHO.length)
    .setValues([DB_CABECALHO])
    .setFontWeight('bold')
    .setBackground('#0047BB')
    .setFontColor('#FFFFFF');
  aba.setFrozenRows(1);

  // Colunas de data como texto simples: evita conversão automática
  // e deslocamento de fuso ao reler os valores.
  aba.getRange('F:G').setNumberFormat('@');
}

/**
 * Garante que a coluna Subcategoria (H) exista, de forma ADITIVA.
 *
 * Só escreve em H1 quando a célula está vazia — nenhuma coluna
 * existente é renomeada, movida ou redimensionada, e nenhuma linha
 * de dados é tocada. Bases anteriores à Fase 2 continuam funcionando
 * com a subcategoria em branco: não há migração obrigatória.
 *
 * @param {Sheet} aba
 */
function garantirColunaSubcategoria_(aba) {
  // Planilha estreita (colunas removidas manualmente): acrescenta ao final.
  var maxColunas = aba.getMaxColumns();
  if (maxColunas < DB_COL_SUBCATEGORIA) {
    aba.insertColumnsAfter(maxColunas, DB_COL_SUBCATEGORIA - maxColunas);
  }

  var celula = aba.getRange(1, DB_COL_SUBCATEGORIA);
  if (String(celula.getValue()).trim() !== '') return; // já existe

  celula.setValue(DB_CABECALHO[DB_COL_SUBCATEGORIA - 1])
    .setFontWeight('bold')
    .setBackground('#0047BB')
    .setFontColor('#FFFFFF');
}

/**
 * Garante que a aba de um tipo exista, sem alterar abas já em uso.
 * @param {Spreadsheet} ss
 * @param {string} chave - "FAQ" ou "TAB".
 * @returns {Sheet}
 */
function garantirAba_(ss, chave) {
  var cfg = DB_ABAS[chave];
  var aba = ss.getSheetByName(cfg.nome);

  if (!aba) {
    aba = ss.insertSheet(cfg.nome);
    escreverCabecalho_(aba);
  } else {
    escreverCabecalho_(aba); // no-op se a aba já tiver conteúdo
  }

  garantirColunaSubcategoria_(aba);
  return aba;
}

/**
 * Retorna a aba correspondente ao tipo, criando-a se necessário.
 * @param {string} tipo - "FAQ" ou "TAB".
 * @returns {Sheet}
 */
function abaPorTipo_(tipo) {
  var cfg = DB_ABAS[tipo];
  if (!cfg) throw new Error('Tipo de registro inválido: ' + tipo);

  var ss = obterPlanilha_();
  return garantirAba_(ss, tipo);
}

/**
 * Localiza a linha (1-indexada) de um registro pelo ID.
 * @param {Sheet} aba
 * @param {string} id
 * @returns {number} Número da linha, ou -1 se não encontrado.
 */
function localizarLinha_(aba, id) {
  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return -1;

  var ids = aba.getRange(2, 1, ultimaLinha - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

/**
 * Converte uma linha da planilha em objeto de registro.
 * @param {Array} linha - Valores da linha.
 * @param {string} tipo - "FAQ" ou "TAB".
 * @returns {Object}
 */
function linhaParaRegistro_(linha, tipo) {
  return {
    id: String(linha[0]),
    tipo: tipo,
    categoria: String(linha[1] || ''),
    // linha[7] pode não existir em bases criadas antes da Fase 2.
    subcategoria: String(linha[7] || ''),
    descricao: String(linha[2] || ''),
    texto: String(linha[3] || ''),
    criadoPor: String(linha[4] || ''),
    dataCriacao: normalizarData_(linha[5]),
    ultimaAlteracao: normalizarData_(linha[6])
  };
}

/**
 * Executa uma operação de escrita protegida por lock,
 * evitando conflito entre usuários simultâneos.
 * @param {Function} operacao - Função a executar.
 * @returns {*} Retorno da operação.
 */
function comLock_(operacao) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Sistema ocupado no momento. Tente novamente em instantes.');
  }
  try {
    return operacao();
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------
 * API pública (google.script.run)
 * ---------------------------------------------------------- */

/**
 * Retorna todos os registros das duas abas.
 * Chamado uma única vez no carregamento; o cliente mantém cache local.
 * @returns {Object} { ok, registros: Array }
 */
function getAllRecords() {
  var registros = [];
  var chaves = ['FAQ', 'TAB'];

  for (var t = 0; t < chaves.length; t++) {
    var tipo = chaves[t];
    var aba = abaPorTipo_(tipo);
    var ultimaLinha = aba.getLastRow();
    if (ultimaLinha < 2) continue;

    // Nunca pedir mais colunas do que a aba possui (base antiga/estreita).
    var colunas = Math.min(DB_CABECALHO.length, aba.getMaxColumns());
    var valores = aba.getRange(2, 1, ultimaLinha - 1, colunas).getValues();
    for (var i = 0; i < valores.length; i++) {
      if (String(valores[i][0])) {
        registros.push(linhaParaRegistro_(valores[i], tipo));
      }
    }
  }

  return { ok: true, registros: registros };
}

/**
 * Cria um novo registro (FAQ ou Tabulação).
 * @param {Object} dados - {tipo, categoria, subcategoria, descricao, texto}
 * @returns {Object} { ok, registro }
 */
function createRecord(dados) {
  var limpo = validarDados_(dados);

  return comLock_(function () {
    var aba = abaPorTipo_(limpo.tipo);
    var agora = agoraFormatado_();

    var registro = {
      id: proximoId_(aba, DB_ABAS[limpo.tipo].prefixo),
      tipo: limpo.tipo,
      categoria: limpo.categoria,
      subcategoria: limpo.subcategoria,
      descricao: limpo.descricao,
      texto: limpo.texto,
      criadoPor: obterUsuario_(),
      dataCriacao: agora,
      ultimaAlteracao: agora
    };

    aba.appendRow([
      registro.id, registro.categoria, registro.descricao, registro.texto,
      registro.criadoPor, registro.dataCriacao, registro.ultimaAlteracao,
      registro.subcategoria
    ]);

    return { ok: true, registro: registro };
  });
}

/**
 * Atualiza um registro existente (categoria, descrição e texto).
 * O tipo e o ID não mudam; "Última alteração" é atualizada.
 * @param {Object} dados - {id, tipo, categoria, subcategoria, descricao, texto}
 * @returns {Object} { ok, registro }
 */
function updateRecord(dados) {
  var limpo = validarDados_(dados);
  var id = String(dados.id || '').trim();
  if (!id) throw new Error('ID do registro não informado.');

  return comLock_(function () {
    var aba = abaPorTipo_(limpo.tipo);
    var linha = localizarLinha_(aba, id);
    if (linha === -1) {
      throw new Error('Registro ' + id + ' não encontrado. Ele pode ter sido excluído.');
    }

    var agora = agoraFormatado_();
    aba.getRange(linha, 2, 1, 3).setValues([[limpo.categoria, limpo.descricao, limpo.texto]]);
    aba.getRange(linha, 7).setValue(agora);
    aba.getRange(linha, DB_COL_SUBCATEGORIA).setValue(limpo.subcategoria);

    var colunas = Math.min(DB_CABECALHO.length, aba.getMaxColumns());
    var valores = aba.getRange(linha, 1, 1, colunas).getValues()[0];
    return { ok: true, registro: linhaParaRegistro_(valores, limpo.tipo) };
  });
}

/**
 * Exclui um registro pelo ID.
 * @param {string} id - Ex.: "FAQ-0003".
 * @returns {Object} { ok, id }
 */
function deleteRecord(id) {
  id = String(id || '').trim();
  var tipo = id.indexOf('FAQ-') === 0 ? 'FAQ' : (id.indexOf('TAB-') === 0 ? 'TAB' : null);
  if (!tipo) throw new Error('ID inválido: ' + id);

  return comLock_(function () {
    var aba = abaPorTipo_(tipo);
    var linha = localizarLinha_(aba, id);
    if (linha === -1) {
      throw new Error('Registro ' + id + ' não encontrado.');
    }
    aba.deleteRow(linha);
    return { ok: true, id: id };
  });
}
