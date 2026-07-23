/**
 * ============================================================
 * BASE DE CONHECIMENTO — Utils.gs
 * Funções utilitárias reutilizáveis (datas, IDs, usuário)
 * ============================================================
 */

/** Fuso horário fixo para evitar deslocamento UTC nas datas. */
var TIMEZONE = 'America/Sao_Paulo';

/** Formato brasileiro de data/hora usado em todo o sistema. */
var FORMATO_DATA = 'dd/MM/yyyy HH:mm';

/**
 * Retorna a data/hora atual formatada no padrão brasileiro.
 * @returns {string} Ex.: "13/07/2026 14:35"
 */
function agoraFormatado_() {
  return Utilities.formatDate(new Date(), TIMEZONE, FORMATO_DATA);
}

/**
 * Normaliza um valor de data vindo da planilha para string BR.
 * O Sheets pode converter strings de data em objetos Date dependendo
 * do locale, então tratamos os dois casos.
 * @param {*} valor - Valor bruto da célula.
 * @returns {string}
 */
function normalizarData_(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, TIMEZONE, FORMATO_DATA);
  }
  return valor ? String(valor) : '';
}

/**
 * Gera o próximo ID sequencial de uma aba (ex.: FAQ-0001, TAB-0042).
 * Varre a coluna A, extrai o maior sufixo numérico e incrementa.
 * @param {Sheet} aba - Aba da planilha.
 * @param {string} prefixo - "FAQ" ou "TAB".
 * @returns {string} Próximo ID formatado.
 */
function proximoId_(aba, prefixo) {
  var ultimaLinha = aba.getLastRow();
  var maior = 0;

  if (ultimaLinha > 1) {
    var ids = aba.getRange(2, 1, ultimaLinha - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i][0]);
      var partes = id.split('-');
      var numero = parseInt(partes[1], 10);
      if (partes[0] === prefixo && !isNaN(numero) && numero > maior) {
        maior = numero;
      }
    }
  }

  var proximo = String(maior + 1);
  while (proximo.length < 4) proximo = '0' + proximo;
  return prefixo + '-' + proximo;
}

/**
 * Retorna o e-mail do usuário ativo (usado em "Criado por").
 * @returns {string}
 */
function obterUsuario_() {
  var email = Session.getActiveUser().getEmail();
  return email || 'Não identificado';
}

/**
 * Valida e higieniza os campos de texto de um registro.
 * Lança erro amigável caso algum campo obrigatório esteja vazio.
 * @param {Object} dados - {tipo, categoria, subcategoria, descricao, texto}
 * @returns {Object} Dados com espaços aparados.
 */
function validarDados_(dados) {
  if (!dados) throw new Error('Nenhum dado recebido.');

  var limpo = {
    tipo: String(dados.tipo || '').trim().toUpperCase(),
    categoria: String(dados.categoria || '').trim(),
    // Subcategoria é OPCIONAL por decisão de projeto: registros
    // anteriores à hierarquia continuam válidos sem preenchê-la,
    // o que dispensa qualquer migração obrigatória.
    subcategoria: String(dados.subcategoria || '').trim(),
    descricao: String(dados.descricao || '').trim(),
    texto: String(dados.texto || '').trim()
  };

  if (limpo.tipo !== 'FAQ' && limpo.tipo !== 'TAB') {
    throw new Error('Tipo inválido. Use FAQ ou Tabulação.');
  }
  if (!limpo.categoria) throw new Error('Informe a categoria.');
  if (limpo.categoria.length > 80) throw new Error('Categoria muito longa (máximo 80 caracteres).');
  if (limpo.subcategoria.length > 80) throw new Error('Subcategoria muito longa (máximo 80 caracteres).');
  if (!limpo.descricao) throw new Error('Informe a descrição/cenário.');
  if (!limpo.texto) throw new Error('Informe o texto.');

  return limpo;
}
