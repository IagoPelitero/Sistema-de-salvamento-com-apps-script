/**
 * ============================================================
 * BASE DE CONHECIMENTO — Code.gs
 * Ponto de entrada do Web App (HTML Service)
 * ============================================================
 * Publicação recomendada:
 *   Implantar > Novo deployment > App da Web
 *   Executar como: Eu | Acesso: Qualquer pessoa na organização
 * ============================================================
 */

/**
 * Serve a interface principal do sistema.
 * @returns {HtmlOutput}
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Base de Conhecimento')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Inclui o conteúdo de um arquivo HTML dentro de outro (parciais).
 * Uso no template: <?!= include('Style'); ?>
 * @param {string} nomeArquivo - Nome do arquivo HTML do projeto.
 * @returns {string} Conteúdo do arquivo.
 */
function include(nomeArquivo) {
  return HtmlService.createHtmlOutputFromFile(nomeArquivo).getContent();
}
