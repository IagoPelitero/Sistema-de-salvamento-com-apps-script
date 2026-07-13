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

/** Nome do arquivo criado no Drive na primeira execução. */
var DB_NOME_ARQUIVO = 'Base de Conhecimento — Dados';

/** Cabeçalho padrão das duas abas. */
var DB_CABECALHO = [
  'ID', 'Categoria', 'Descrição/Cenário', 'Texto',
  'Criado por', 'Data criação', 'Última alteração'
];

/** Configuração das abas por tipo de registro. */
var DB_ABAS = {
  FAQ: { nome: 'FAQ', prefixo: 'FAQ' },
  TAB: { nome: 'TABULAÇÕES', prefixo: 'TAB' }
};

/* ------------------------------------------------------------
 * Infraestrutura
 * ---------------------------------------------------------- */

/**
 * Obtém a planilha-banco. Cria automaticamente caso não exista
 * ou caso o arquivo salvo tenha sido excluído.
 * @returns {Spreadsheet}
 */
function obterPlanilha_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(DB_PROP_KEY);

  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      // Arquivo foi excluído — recria abaixo.
    }
  }

  var ss = SpreadsheetApp.create(DB_NOME_ARQUIVO);
  props.setProperty(DB_PROP_KEY, ss.getId());
  configurarAbas_(ss);
  return ss;
}

/**
 * Garante que as duas abas existam com cabeçalho formatado.
 * Remove a "Página1" padrão criada pelo Sheets.
 * @param {Spreadsheet} ss
 */
function configurarAbas_(ss) {
  var chaves = ['FAQ', 'TAB'];

  for (var i = 0; i < chaves.length; i++) {
    var cfg = DB_ABAS[chaves[i]];
    var aba = ss.getSheetByName(cfg.nome);

    if (!aba) aba = ss.insertSheet(cfg.nome);

    var cabecalho = aba.getRange(1, 1, 1, DB_CABECALHO.length);
    cabecalho.setValues([DB_CABECALHO])
      .setFontWeight('bold')
      .setBackground('#0047BB')
      .setFontColor('#FFFFFF');
    aba.setFrozenRows(1);

    // Colunas de data como texto simples: evita conversão automática
    // e deslocamento de fuso ao reler os valores.
    aba.getRange('F:G').setNumberFormat('@');
  }

  // Remove a aba padrão vazia, se existir.
  var padrao = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
  if (padrao && ss.getSheets().length > 2) ss.deleteSheet(padrao);
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
  var aba = ss.getSheetByName(cfg.nome);
  if (!aba) {
    configurarAbas_(ss);
    aba = ss.getSheetByName(cfg.nome);
  }
  return aba;
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

    var valores = aba.getRange(2, 1, ultimaLinha - 1, DB_CABECALHO.length).getValues();
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
 * @param {Object} dados - {tipo, categoria, descricao, texto}
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
      descricao: limpo.descricao,
      texto: limpo.texto,
      criadoPor: obterUsuario_(),
      dataCriacao: agora,
      ultimaAlteracao: agora
    };

    aba.appendRow([
      registro.id, registro.categoria, registro.descricao, registro.texto,
      registro.criadoPor, registro.dataCriacao, registro.ultimaAlteracao
    ]);

    return { ok: true, registro: registro };
  });
}

/**
 * Atualiza um registro existente (categoria, descrição e texto).
 * O tipo e o ID não mudam; "Última alteração" é atualizada.
 * @param {Object} dados - {id, tipo, categoria, descricao, texto}
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

    var valores = aba.getRange(linha, 1, 1, DB_CABECALHO.length).getValues()[0];
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
