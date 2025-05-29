// functions/clientes/adicionarCliente.js

const { onCall } = require('firebase-functions/v2/https');
const { db } = require('../admin/admin');
const { FieldValue } = require('firebase-admin/firestore');
const { validarAutenticacao } = require('../utils/validarAutenticacao');
const { verificarPermissao } = require('../utils/verificarPermissao');
const { validarDados } = require('../utils/validarCampos');
const { validarCPF } = require('../utils/validarCPF');
const { validarTelefone } = require('../utils/validarTelefone');
const { ETAPAS_FUNIL } = require('../../CONFIG/config'); // ajuste conforme sua estrutura
const { logger } = require('firebase-functions/v2');

/**
 * Função Cloud Callable para adicionar um novo cliente ao sistema
 */
exports.adicionarCliente = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (apenas admin, gerente e vendedor podem adicionar clientes)
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN, 
    CONFIG.PERFIS_USUARIO.GERENTE, 
    CONFIG.PERFIS_USUARIO.VENDEDOR
  ]);
  
  // Valida dados obrigatórios
  validarDados(data, ['nomeCompleto', 'cpf']);
  
  // Validações específicas
  if (data.cpf && !validarCPF(data.cpf)) {
    throw new HttpsError('invalid-argument', 'CPF inválido');
  }
  
  if (data.telefone && !validarTelefone(data.telefone)) {
    throw new HttpsError('invalid-argument', 'Telefone inválido');
  }
  
  // Verifica se o CPF já existe
  const cpfLimpo = data.cpf.replace(/[^\d]/g, '');
  const clientesExistentes = await db.collection('clientes')
    .where('cpf', '==', cpfLimpo)
    .limit(1)
    .get();
  
  if (!clientesExistentes.empty) {
    throw new HttpsError(
      'already-exists',
      'Já existe um cliente cadastrado com este CPF'
    );
  }
  
  // PREPARA OS DADOS PARA SALVAR NO FIRESTORE
  const dadosParaFirestore = {
    nomeCompleto: data.nomeCompleto,
    cpf: cpfLimpo,
    telefone: data.telefone || '',
    telefoneWhatsapp: data.telefoneWhatsapp || data.telefone || '',
    enderecoCompleto: data.enderecoCompleto || '',
    beneficioMatricula: data.beneficioMatricula || '',
    
    // Adiciona campos gerados pela própria função:
    dataCriacao: FieldValue.serverTimestamp(),
    usuarioCriacaoId: usuarioId,
    // Adiciona o cliente na primeira etapa do funil por padrão
    etapaFunil: ETAPAS_FUNIL.OPORTUNIDADE,
    // Campos para controle de alertas e prospecção
    alertaRecorrencia: false,
    percentualPago: 0,
    emProspeccao: false,
    ultimaAtualizacaoPrazo: FieldValue.serverTimestamp()
  };

  try {
    // Adiciona o objeto como um novo documento na coleção 'clientes' no Firestore
    const docRef = await db.collection('clientes').add(dadosParaFirestore);

    // Loga no console com logging estruturado
    logger.info('Novo cliente adicionado', {
      clienteId: docRef.id,
      usuarioId: usuarioId,
      nomeCliente: data.nomeCompleto
    });

    // Retorna o ID do cliente criado
    return {
      message: 'Cliente adicionado com sucesso!',
      clienteId: docRef.id
    };
  } catch (error) {
    // Se algo der errado durante a adição no Firestore
    logger.error('Erro ao adicionar cliente', {
      error: error.message,
      usuarioId: usuarioId,
      dadosCliente: {
        nome: data.nomeCompleto,
        cpf: cpfLimpo
      }
    });
    throw new HttpsError('internal', `Erro ao adicionar cliente: ${error.message}`);
  }
});