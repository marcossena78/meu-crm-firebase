// ===== CRM SOUZACRED - IMPORTAÇÕES ATUALIZADAS (Firebase v2) ===== //
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Inicializa o Firebase Admin
admin.initializeApp();
const db = getFirestore();

// Configuração das etapas do funil como variável de ambiente para fácil manutenção
const ETAPAS_FUNIL = {
  OPORTUNIDADE: 'oportunidade',
  CONTATO_INICIAL: 'contato_inicial',
  PROPOSTA_ENVIADA: 'proposta_enviada',
  NEGOCIACAO: 'negociacao',
  FECHADO_GANHO: 'fechado_ganho',
  FECHADO_PERDIDO: 'fechado_perdido'
};

// Array de etapas válidas para validação
const etapasValidas = Object.values(ETAPAS_FUNIL);

// Configurações via variáveis de ambiente
const CONFIG = {
  // Valores padrão que podem ser substituídos por variáveis de ambiente
  TAXA_JUROS_PADRAO: parseFloat(process.env.TAXA_JUROS_PADRAO || '0.016'),
  LIMITE_PAGINACAO_PADRAO: parseInt(process.env.LIMITE_PAGINACAO_PADRAO || '10'),
  LIMITE_BATCH_OPERACOES: parseInt(process.env.LIMITE_BATCH_OPERACOES || '450'), // Limite seguro para batch (máx 500)
  PERFIS_USUARIO: {
    ADMIN: 'admin',
    GERENTE: 'gerente',
    VENDEDOR: 'vendedor',
    SUPORTE: 'suporte'
  },
  // Configuração do usuário master (admin)
  USUARIO_MASTER: {
    EMAIL: 'marcos.sen@hotmail.com',
    NOME: 'Marcos',
    PERFIL: 'admin'
  }
};

// Middleware para validação de autenticação
const validarAutenticacao = async (context) => {
  // Verifica se o usuário está autenticado
  if (!context.auth) {
    throw new HttpsError(
      'unauthenticated',
      'O usuário deve estar autenticado para realizar esta operação.'
    );
  }
  return context.auth.uid;
};

// Middleware para verificação de permissões (RBAC) com verificação dinâmica no Firestore
const verificarPermissao = async (usuarioId, permissoesNecessarias) => {
  try {
    // Obtém o documento do usuário
    const usuarioRef = db.collection('usuarios').doc(usuarioId);
    const usuarioDoc = await usuarioRef.get();
    
    // Verifica se o usuário é o usuário master (admin) configurado
    if (!usuarioDoc.exists) {
      // Se o documento não existe, verifica se é o primeiro acesso do usuário master
      const usuarioAuth = await admin.auth().getUser(usuarioId);
      
      // Se o email corresponder ao usuário master configurado, cria o perfil automaticamente
      if (usuarioAuth.email === CONFIG.USUARIO_MASTER.EMAIL) {
        // Cria o documento do usuário master com perfil de admin
        await usuarioRef.set({
          nome: CONFIG.USUARIO_MASTER.NOME,
          email: CONFIG.USUARIO_MASTER.EMAIL,
          perfil: CONFIG.USUARIO_MASTER.PERFIL,
          dataCriacao: FieldValue.serverTimestamp(),
          ativo: true,
          uid: usuarioId
        });
        
        logger.info('Perfil de usuário master criado automaticamente', {
          usuarioId: usuarioId,
          email: CONFIG.USUARIO_MASTER.EMAIL
        });
        
        // Como é o usuário master, concede acesso independente das permissões necessárias
        return CONFIG.USUARIO_MASTER.PERFIL;
      } else {
        throw new HttpsError(
          'permission-denied',
          'Usuário não encontrado no sistema'
        );
      }
    }
    
    const perfil = usuarioDoc.data().perfil;
    
    // Verifica se o perfil do usuário está na lista de permissões necessárias
    if (!permissoesNecessarias.includes(perfil)) {
      throw new HttpsError(
        'permission-denied',
        `Permissão negada. Perfil necessário: ${permissoesNecessarias.join(' ou ')}`
      );
    }
    
    return perfil;
  } catch (error) {
    logger.error('Erro ao verificar permissão:', error);
    throw new HttpsError(
      'internal',
      `Erro ao verificar permissão: ${error.message}`
    );
  }
};

// Middleware para validação de dados
const validarDados = (dados, camposObrigatorios) => {
  const camposFaltantes = [];
  
  camposObrigatorios.forEach(campo => {
    if (dados[campo] === undefined || dados[campo] === null || dados[campo] === '') {
      camposFaltantes.push(campo);
    }
  });
  
  if (camposFaltantes.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `Campos obrigatórios não fornecidos: ${camposFaltantes.join(', ')}`
    );
  }
  
  return true;
};

// Middleware para validação de paginação
const validarPaginacao = (pagina, ultimoDocId) => {
  if (pagina > 1 && ultimoDocId) {
    throw new HttpsError(
      'invalid-argument',
      'Use apenas "pagina" ou "ultimoDocId", não ambos'
    );
  }
};

// Função para validar CPF
const validarCPF = (cpf) => {
  // Remove caracteres não numéricos
  cpf = cpf.replace(/[^\d]/g, '');
  
  // Verifica se tem 11 dígitos
  if (cpf.length !== 11) {
    return false;
  }
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(cpf)) {
    return false;
  }
  
  // Validação do primeiro dígito verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let resto = soma % 11;
  let dv1 = resto < 2 ? 0 : 11 - resto;
  
  if (parseInt(cpf.charAt(9)) !== dv1) {
    return false;
  }
  
  // Validação do segundo dígito verificador
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpf.charAt(i)) * (11 - i);
  }
  resto = soma % 11;
  let dv2 = resto < 2 ? 0 : 11 - resto;
  
  if (parseInt(cpf.charAt(10)) !== dv2) {
    return false;
  }
  
  return true;
};

// Função para validar telefone
const validarTelefone = (telefone) => {
  // Remove caracteres não numéricos
  telefone = telefone.replace(/[^\d]/g, '');
  
  // Verifica se tem entre 10 e 11 dígitos (com ou sem DDD)
  return telefone.length >= 10 && telefone.length <= 11;
};

// Função auxiliar para excluir subcoleções em lotes (CORRIGIDO com for...of)
const excluirSubcolecaoEmLotes = async (docRef, subcolecao) => {
  let batchCount = 0;
  let docsProcessados = 0;
  let batch = db.batch();
  
  // Busca documentos da subcoleção em lotes
  const snapshot = await docRef.collection(subcolecao).limit(CONFIG.LIMITE_BATCH_OPERACOES).get();
  
  // Se não houver documentos, retorna
  if (snapshot.empty) {
    return 0;
  }
  
  // Processa os documentos em lotes usando for...of para suportar await
  for (const doc of snapshot.docs) { // <-- ALTERAÇÃO AQUI: Usando for...of
    batch.delete(doc.ref);
    batchCount++;
    docsProcessados++;
    
    // Se atingir o limite de operações por batch, executa e cria um novo batch
    if (batchCount >= CONFIG.LIMITE_BATCH_OPERACOES) {
      await batch.commit(); // <-- AGORA SIM COM await
      batch = db.batch();
      batchCount = 0;
    }
  }
  
  // Executa o último batch se houver operações pendentes
  if (batchCount > 0) {
    await batch.commit();
  }
  
  // Se ainda houver documentos, chama recursivamente
   // Verifica snapshot.docs.length para saber se o limite foi atingido
  if (snapshot.docs.length === CONFIG.LIMITE_BATCH_OPERACOES) { // <-- Correção: usar docs.length
      // Espera a chamada recursiva terminar
      docsProcessados += await excluirSubcolecaoEmLotes(docRef, subcolecao);
  }
  
  return docsProcessados;
}; // Fim da função excluirSubcolecaoEmLotes

// FUNÇÃO PARA ADICIONAR CLIENTE (MIGRADA PARA CALLABLE)
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
  
// FUNÇÃO PARA OBTER MÉTRICAS DO DASHBOARD
exports.obterMetricasDashboard = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);

  // Verifica permissão (todos os perfis podem acessar o dashboard)
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN,
    CONFIG.PERFIS_USUARIO.GERENTE,
    CONFIG.PERFIS_USUARIO.VENDEDOR,
    CONFIG.PERFIS_USUARIO.SUPORTE
  ]);

  try {
    // Contar clientes ativos (exemplo: etapaFunil diferente de fechado_perdido)
    const clientesSnapshot = await db.collection('clientes')
      .where('etapaFunil', '!=', ETAPAS_FUNIL.FECHADO_PERDIDO)
      .get();
    const clientesAtivos = clientesSnapshot.size;

    // Contar empréstimos ativos (exemplo: status 'ativo')
    const emprestimosSnapshot = await db.collection('emprestimos')
      .where('status', '==', 'ativo')
      .get();
    const emprestimosAtivos = emprestimosSnapshot.size;

    // Somar valor total emprestado (somar campo 'valor' dos empréstimos ativos)
    let valorTotalEmprestado = 0;
    emprestimosSnapshot.forEach(doc => {
      const data = doc.data();
      valorTotalEmprestado += data.valor || 0;
    });

    // Calcular taxa de conversão (exemplo: clientes fechados ganho / total clientes)
    const clientesFechadosSnapshot = await db.collection('clientes')
      .where('etapaFunil', '==', ETAPAS_FUNIL.FECHADO_GANHO)
      .get();
    const clientesFechados = clientesFechadosSnapshot.size;

    const totalClientesSnapshot = await db.collection('clientes').get();
    const totalClientes = totalClientesSnapshot.size;

    const taxaConversao = totalClientes > 0 ? (clientesFechados / totalClientes) * 100 : 0;

    return {
      clientesAtivos,
      emprestimosAtivos,
      valorTotalEmprestado,
      taxaConversao: taxaConversao.toFixed(2)
    };
  } catch (error) {
    logger.error('Erro ao obter métricas do dashboard', { error: error.message, usuarioId });
    throw new HttpsError('internal', `Erro ao obter métricas do dashboard: ${error.message}`);
  }
});

// FUNÇÃO PARA LISTAR TODOS OS CLIENTES (MIGRADA PARA CALLABLE COM PAGINAÇÃO)
exports.listarClientes = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (todos os perfis podem listar clientes)
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN, 
    CONFIG.PERFIS_USUARIO.GERENTE, 
    CONFIG.PERFIS_USUARIO.VENDEDOR,
    CONFIG.PERFIS_USUARIO.SUPORTE
  ]);
  
  try {
    // Parâmetros de paginação e filtros
    const limite = data?.limite || CONFIG.LIMITE_PAGINACAO_PADRAO;
    const pagina = data?.pagina || 1;
    const ultimoDocId = data?.ultimoDocId || null;
    const filtros = data?.filtros || {};
    
    // Validação de paginação
    validarPaginacao(pagina, ultimoDocId);
    
    // Criar query base
    let query = db.collection('clientes');
    
    // Aplicar filtros
    if (filtros.etapaFunil) {
      query = query.where('etapaFunil', '==', filtros.etapaFunil);
    }
    
    if (filtros.emProspeccao !== undefined) {
      query = query.where('emProspeccao', '==', filtros.emProspeccao);
    }
    
    if (filtros.alertaRecorrencia !== undefined) {
      query = query.where('alertaRecorrencia', '==', filtros.alertaRecorrencia);
    }
    
    if (filtros.bancoEmprestimo) {
      query = query.where('bancoEmprestimo', '==', filtros.bancoEmprestimo);
    }
    
    // Ordenação
    query = query.orderBy('dataCriacao', 'desc');
    
    // Aplicar cursor se fornecido
    if (ultimoDocId) {
      const docRef = db.collection('clientes').doc(ultimoDocId);
      const doc = await docRef.get();
      if (doc.exists) {
        query = query.startAfter(doc);
      }
    } else if (pagina > 1) {
      // Se não tiver cursor mas tiver página, calcular skip
      const skipCount = (pagina - 1) * limite;
      const skipSnapshot = await db.collection('clientes')
                                 .orderBy('dataCriacao', 'desc')
                                 .limit(skipCount)
                                 .get();
      const lastDoc = skipSnapshot.docs[skipSnapshot.docs.length - 1];
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
    }
    
    // Aplicar limite
    query = query.limit(limite);
    
    // Executar query
    const snapshot = await query.get();
    
    // Obter total de documentos (para metadados de paginação)
    // Nota: Esta é uma operação cara, considere usar contadores distribuídos para grandes volumes
    const totalSnapshot = await db.collection('clientes').count().get();
    const total = totalSnapshot.data().count;
    
    // Preparar dados
    const clientes = [];
    snapshot.forEach(doc => {
      clientes.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Preparar metadados de paginação
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const nextPageToken = lastDoc ? lastDoc.id : null;
    
    // Log da operação
    logger.info('Clientes listados', {
      usuarioId: usuarioId,
      totalRetornado: clientes.length,
      pagina: pagina,
      filtros: filtros
    });
    
    // Retornar dados com metadados de paginação
    return {
      data: clientes,
      meta: {
        total: total,
        pagina: pagina,
        limite: limite,
        totalPaginas: Math.ceil(total / limite),
        proximaPagina: nextPageToken ? pagina + 1 : null,
        ultimoDocId: nextPageToken
      }
    };
  } catch (error) {
    logger.error('Erro ao listar clientes', {
      error: error.message,
      usuarioId: usuarioId,
      filtros: data?.filtros
    });
    throw new HttpsError('internal', `Erro ao listar clientes: ${error.message}`);
  }
});

// FUNÇÃO PARA BUSCAR CLIENTES (NOVA FUNÇÃO PARA BUSCA AVANÇADA)
exports.buscarClientes = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (todos os perfis podem buscar clientes)
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN, 
    CONFIG.PERFIS_USUARIO.GERENTE, 
    CONFIG.PERFIS_USUARIO.VENDEDOR,
    CONFIG.PERFIS_USUARIO.SUPORTE
  ]);
  
  try {
    const termo = data?.termo;
    
    if (!termo) {
      throw new HttpsError('invalid-argument', 'Termo de busca é obrigatório');
    }
    
    // Buscar por nome (começa com)
    const porNomeSnapshot = await db.collection('clientes')
                                  .orderBy('nomeCompleto')
                                  .startAt(termo)
                                  .endAt(termo + '\uf8ff')
                                  .limit(10)
                                  .get();
    
    // Buscar por CPF (exato)
    const cpfLimpo = termo.replace(/[^\d]/g, '');
    const porCpfSnapshot = await db.collection('clientes')
                                 .where('cpf', '==', cpfLimpo)
                                 .limit(5)
                                 .get();
    
    // Buscar por telefone (exato)
    const telefoneLimpo = termo.replace(/[^\d]/g, '');
    const porTelefoneSnapshot = await db.collection('clientes')
                                      .where('telefone', '==', telefoneLimpo)
                                      .limit(5)
                                      .get();
    
    // Combinar resultados
    const resultados = new Map();
    
    // Adicionar resultados por nome
    porNomeSnapshot.forEach(doc => {
      resultados.set(doc.id, {
        id: doc.id,
        ...doc.data(),
        matchType: 'nome'
      });
    });
    
    // Adicionar resultados por CPF
    porCpfSnapshot.forEach(doc => {
      resultados.set(doc.id, {
        id: doc.id,
        ...doc.data(),
        matchType: 'cpf'
      });
    });
    
    // Adicionar resultados por telefone
    porTelefoneSnapshot.forEach(doc => {
      resultados.set(doc.id, {
        id: doc.id,
        ...doc.data(),
        matchType: 'telefone'
      });
    });
    
    // Converter para array
    const clientes = Array.from(resultados.values());
    
    // Log da operação
    logger.info('Busca de clientes realizada', {
      usuarioId: usuarioId,
      termo: termo,
      resultados: clientes.length
    });
    
    // Retornar resultados
    return {
      data: clientes,
      meta: {
        total: clientes.length,
        termo: termo
      }
    };
  } catch (error) {
    logger.error('Erro ao buscar clientes', {
      error: error.message,
      usuarioId: usuarioId,
      termo: data?.termo
    });
    throw new HttpsError('internal', `Erro ao buscar clientes: ${error.message}`);
  }
});

// FUNÇÃO PARA OBTER DETALHES DE UM CLIENTE ESPECÍFICO (MIGRADA PARA CALLABLE)
exports.obterCliente = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (todos os perfis podem obter detalhes de clientes)
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN, 
    CONFIG.PERFIS_USUARIO.GERENTE, 
    CONFIG.PERFIS_USUARIO.VENDEDOR,
    CONFIG.PERFIS_USUARIO.SUPORTE
  ]);
  
  // Valida dados obrigatórios
  validarDados(data, ['clienteId']);
  
  const clienteId = data.clienteId;
  const limite = data?.limiteEmprestimos || CONFIG.LIMITE_PAGINACAO_PADRAO;
  const ultimoEmprestimoId = data?.ultimoEmprestimoId || null;

  try {
    // Obtém o documento do cliente pelo ID
    const docRef = db.collection('clientes').doc(clienteId);
    const doc = await docRef.get();
    
    // Verifica se o documento existe
    if (!doc.exists) {
      throw new HttpsError('not-found', 'Cliente não encontrado');
    }
    
    // Obtém os empréstimos do cliente com paginação
    let emprestimosQuery = docRef.collection('emprestimos')
                               .orderBy('dataCriacao', 'desc')
                               .limit(limite);
    
    // Aplica cursor se fornecido
    if (ultimoEmprestimoId) {
      const emprestimoDocRef = docRef.collection('emprestimos').doc(ultimoEmprestimoId);
      const emprestimoDoc = await emprestimoDocRef.get();
      if (emprestimoDoc.exists) {
        emprestimosQuery = emprestimosQuery.startAfter(emprestimoDoc);
      }
    }
    
    const emprestimosSnapshot = await emprestimosQuery.get();
    
    // Obtém o total de empréstimos para metadados de paginação
    const totalEmprestimosSnapshot = await docRef.collection('emprestimos').count().get();
    const totalEmprestimos = totalEmprestimosSnapshot.data().count;
    
    // Prepara os dados dos empréstimos
    const emprestimos = [];
    emprestimosSnapshot.forEach(emprestimoDoc => {
      emprestimos.push({
        id: emprestimoDoc.id,
        ...emprestimoDoc.data()
      });
    });
    
    // Prepara metadados de paginação para empréstimos
    const lastEmprestimoDoc = emprestimosSnapshot.docs[emprestimosSnapshot.docs.length - 1];
    const nextEmprestimoToken = lastEmprestimoDoc ? lastEmprestimoDoc.id : null;
    
    // Log da operação
    logger.info('Detalhes do cliente obtidos', {
      usuarioId: usuarioId,
      clienteId: clienteId,
      totalEmprestimos: emprestimos.length
    });
    
    // Retorna os dados do cliente com seus empréstimos e metadados de paginação
    return {
      id: doc.id,
      ...doc.data(),
      emprestimos: emprestimos,
      metaEmprestimos: {
        total: totalEmprestimos,
        limite: limite,
        totalPaginas: Math.ceil(totalEmprestimos / limite),
        proximoToken: nextEmprestimoToken
      }
    };
  } catch (error) {
    logger.error('Erro ao obter cliente', {
      error: error.message,
      usuarioId: usuarioId,
      clienteId: clienteId
    });
    throw new HttpsError('internal', `Erro ao obter cliente: ${error.message}`);
  }
});
// RELATÓRIO DE CLIENTES
exports.relatorioClientes = onCall(async (data, context) => {
  const usuarioId = await validarAutenticacao(context);
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN,
    CONFIG.PERFIS_USUARIO.GERENTE
  ]);
  try {
    const snap = await db.collection('clientes').limit(100).get();
    const headers = ['Nome', 'CPF', 'Telefone', 'Etapa Funil', 'Data Criação'];
    const rows = [];
    snap.forEach(doc => {
      const c = doc.data();
      rows.push([
        c.nomeCompleto || '',
        c.cpf || '',
        c.telefone || '',
        c.etapaFunil || '',
        c.dataCriacao && c.dataCriacao.seconds ? new Date(c.dataCriacao.seconds * 1000).toLocaleDateString('pt-BR') : ''
      ]);
    });
    return { headers, rows };
  } catch (error) {
    logger.error('Erro ao gerar relatório de clientes', { error: error.message, usuarioId });
    throw new HttpsError('internal', `Erro ao gerar relatório: ${error.message}`);
  }
});

// RELATÓRIO DE EMPRÉSTIMOS
exports.relatorioEmprestimos = onCall(async (data, context) => {
  const usuarioId = await validarAutenticacao(context);
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN,
    CONFIG.PERFIS_USUARIO.GERENTE
  ]);
  try {
    const snap = await db.collection('emprestimos').limit(100).get();
    const headers = ['Cliente', 'Valor', 'Parcelas', 'Taxa', 'Status', 'Data Solicitação'];
    const rows = [];
    snap.forEach(doc => {
      const e = doc.data();
      rows.push([
        e.nomeCliente || '',
        e.valor ? `R$ ${e.valor.toLocaleString('pt-BR')}` : '',
        e.parcelas || '',
        e.taxaJuros || '',
        e.status || '',
        e.dataSolicitacao && e.dataSolicitacao.seconds ? new Date(e.dataSolicitacao.seconds * 1000).toLocaleDateString('pt-BR') : ''
      ]);
    });
    return { headers, rows };
  } catch (error) {
    logger.error('Erro ao gerar relatório de empréstimos', { error: error.message, usuarioId });
    throw new HttpsError('internal', `Erro ao gerar relatório: ${error.message}`);
  }
});

// RELATÓRIO DO FUNIL DE VENDAS
exports.relatorioFunil = onCall(async (data, context) => {
  const usuarioId = await validarAutenticacao(context);
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN,
    CONFIG.PERFIS_USUARIO.GERENTE
  ]);
  try {
    const etapas = Object.values(ETAPAS_FUNIL);
    const headers = ['Etapa', 'Total de Clientes'];
    const rows = [];
    for (const etapa of etapas) {
      const snap = await db.collection('clientes').where('etapaFunil', '==', etapa).get();
      rows.push([
        etapa,
        snap.size
      ]);
    }
    return { headers, rows };
  } catch (error) {
    logger.error('Erro ao gerar relatório do funil', { error: error.message, usuarioId });
    throw new HttpsError('internal', `Erro ao gerar relatório: ${error.message}`);
  }
});
// FUNÇÃO PARA OBTER CONFIGURAÇÕES DO SISTEMA
exports.obterConfiguracoesSistema = onCall(async (data, context) => {
  const usuarioId = await validarAutenticacao(context);
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN,
    CONFIG.PERFIS_USUARIO.GERENTE
  ]);
  try {
    const doc = await db.collection('configuracoes').doc('sistema').get();
    if (!doc.exists) return {};
    return doc.data();
  } catch (error) {
    logger.error('Erro ao obter configurações do sistema', { error: error.message, usuarioId });
    throw new HttpsError('internal', `Erro ao obter configurações: ${error.message}`);
  }
});

// FUNÇÃO PARA ATUALIZAR CONFIGURAÇÕES DO SISTEMA
exports.atualizarConfiguracoesSistema = onCall(async (data, context) => {
  const usuarioId = await validarAutenticacao(context);
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN
  ]);
  try {
    await db.collection('configuracoes').doc('sistema').set({
      taxaJurosPadrao: data.taxaJurosPadrao,
      limitePaginacaoPadrao: data.limitePaginacaoPadrao,
      limiteBatchOperacoes: data.limiteBatchOperacoes
    }, { merge: true });
    return { success: true };
  } catch (error) {
    logger.error('Erro ao atualizar configurações do sistema', { error: error.message, usuarioId });
    throw new HttpsError('internal', `Erro ao atualizar configurações: ${error.message}`);
  }
});
// FUNÇÃO PARA OBTER DADOS DE PERFORMANCE DO DASHBOARD
exports.obterDadosPerformance = onCall(async (data, context) => {
  const usuarioId = await validarAutenticacao(context);

  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN,
    CONFIG.PERFIS_USUARIO.GERENTE,
    CONFIG.PERFIS_USUARIO.VENDEDOR,
    CONFIG.PERFIS_USUARIO.SUPORTE
  ]);

  try {
    // Parâmetro: período em dias (ex: 7, 30, 90)
    const periodo = parseInt(data.periodo) || 30;
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - periodo + 1);

    // Busca empréstimos aprovados no período
    const emprestimosSnap = await db.collection('emprestimos')
      .where('status', '==', 'aprovado')
      .where('dataSolicitacao', '>=', inicio)
      .get();

    // Agrupa por dia/semana/mês conforme o período
    const labels = [];
    const valores = [];
    const agrupamento = periodo <= 7 ? 'dia' : (periodo <= 30 ? 'semana' : 'mes');
    const mapa = {};

    emprestimosSnap.forEach(doc => {
      const e = doc.data();
      const data = e.dataSolicitacao && e.dataSolicitacao.toDate ? e.dataSolicitacao.toDate() : (e.dataSolicitacao instanceof Date ? e.dataSolicitacao : null);
      if (!data) return;
      let chave;
      if (agrupamento === 'dia') {
        chave = data.toLocaleDateString('pt-BR');
      } else if (agrupamento === 'semana') {
        const semana = Math.ceil(data.getDate() / 7);
        chave = `Semana ${semana}`;
      } else {
        chave = data.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      }
      mapa[chave] = (mapa[chave] || 0) + (e.valor || 0);
    });

    Object.entries(mapa).forEach(([k, v]) => {
      labels.push(k);
      valores.push(v);
    });

    // Meta mensal (exemplo fixo)
    const meta = 500000;
    const progresso = valores.reduce((soma, v) => soma + v, 0);

    return {
      labels,
      valores,
      meta,
      progresso
    };
  } catch (error) {
    logger.error('Erro ao obter dados de performance', {
      error: error.message,
      usuarioId
    });
    throw new HttpsError('internal', `Erro ao obter dados de performance: ${error.message}`);
  }
});
// FUNÇÃO PARA OBTER ATIVIDADES RECENTES DO SISTEMA
exports.obterAtividadesRecentes = onCall(async (data, context) => {
  const usuarioId = await validarAutenticacao(context);

  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN,
    CONFIG.PERFIS_USUARIO.GERENTE,
    CONFIG.PERFIS_USUARIO.VENDEDOR,
    CONFIG.PERFIS_USUARIO.SUPORTE
  ]);

  try {
    // Busca as últimas 20 atividades do log (exemplo: clientes criados, movimentações no funil, empréstimos aprovados)
    // Aqui usamos uma coleção "atividades" que deve ser alimentada por outras funções do sistema
    const atividadesSnap = await db.collection('atividades')
      .orderBy('data', 'desc')
      .limit(20)
      .get();

    const atividades = [];
    atividadesSnap.forEach(doc => atividades.push({ id: doc.id, ...doc.data() }));

    return { atividades };
  } catch (error) {
    logger.error('Erro ao obter atividades recentes', {
      error: error.message,
      usuarioId
    });
    throw new HttpsError('internal', `Erro ao obter atividades recentes: ${error.message}`);
  }
});
// FUNÇÃO PARA OBTER DETALHES COMPLETOS DE UM CLIENTE
exports.obterDetalhesCliente = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);

  // Verifica permissão (todos os perfis podem visualizar detalhes)
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN,
    CONFIG.PERFIS_USUARIO.GERENTE,
    CONFIG.PERFIS_USUARIO.VENDEDOR,
    CONFIG.PERFIS_USUARIO.SUPORTE
  ]);

  try {
    const clienteId = data.clienteId;
    if (!clienteId) {
      throw new HttpsError('invalid-argument', 'ID do cliente não informado.');
    }

    // Busca o cliente
    const doc = await db.collection('clientes').doc(clienteId).get();
    if (!doc.exists) {
      throw new HttpsError('not-found', 'Cliente não encontrado.');
    }
    const clienteData = doc.data();

    // Busca empréstimos do cliente
    const emprestimosSnap = await db.collection('emprestimos')
      .where('clienteId', '==', clienteId)
      .get();
    const emprestimos = [];
    emprestimosSnap.forEach(e => emprestimos.push({ id: e.id, ...e.data() }));

    // Busca histórico do cliente (se existir)
    const historico = clienteData.historico || [];

    return {
      id: doc.id,
      ...clienteData,
      emprestimos,
      historico
    };
  } catch (error) {
    logger.error('Erro ao obter detalhes do cliente', {
      error: error.message,
      usuarioId: usuarioId,
      clienteId: data.clienteId
    });
    throw new HttpsError('internal', `Erro ao obter detalhes do cliente: ${error.message}`);
  }
});

// FUNÇÃO PARA LISTAR EMPRÉSTIMOS DE UM CLIENTE (NOVA FUNÇÃO COM PAGINAÇÃO)
exports.listarEmprestimosCliente = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (todos os perfis podem listar empréstimos)
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN, 
    CONFIG.PERFIS_USUARIO.GERENTE, 
    CONFIG.PERFIS_USUARIO.VENDEDOR,
    CONFIG.PERFIS_USUARIO.SUPORTE
  ]);
  
  // Valida dados obrigatórios
  validarDados(data, ['clienteId']);
  
  const clienteId = data.clienteId;
  const limite = data?.limite || CONFIG.LIMITE_PAGINACAO_PADRAO;
  const pagina = data?.pagina || 1;
  const ultimoDocId = data?.ultimoDocId || null;
  
  // Validação de paginação
  validarPaginacao(pagina, ultimoDocId);

  try {
    // Verifica se o cliente existe
    const clienteRef = db.collection('clientes').doc(clienteId);
    const clienteDoc = await clienteRef.get();
    
    if (!clienteDoc.exists) {
      throw new HttpsError('not-found', 'Cliente não encontrado');
    }
    
    // Criar query base
    let query = clienteRef.collection('emprestimos').orderBy('dataCriacao', 'desc');
    
    // Aplicar cursor se fornecido
    if (ultimoDocId) {
      const docRef = clienteRef.collection('emprestimos').doc(ultimoDocId);
      const doc = await docRef.get();
      if (doc.exists) {
        query = query.startAfter(doc);
      }
    } else if (pagina > 1) {
      // Se não tiver cursor mas tiver página, calcular skip
      const skipCount = (pagina - 1) * limite;
      const skipSnapshot = await clienteRef.collection('emprestimos')
                                        .orderBy('dataCriacao', 'desc')
                                        .limit(skipCount)
                                        .get();
      const lastDoc = skipSnapshot.docs[skipSnapshot.docs.length - 1];
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
    }
    
    // Aplicar limite
    query = query.limit(limite);
    
    // Executar query
    const snapshot = await query.get();
    
    // Obter total de empréstimos (para metadados de paginação)
    const totalSnapshot = await clienteRef.collection('emprestimos').count().get();
    const total = totalSnapshot.data().count;
    
    // Preparar dados
    const emprestimos = [];
    snapshot.forEach(doc => {
      emprestimos.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Preparar metadados de paginação
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const nextPageToken = lastDoc ? lastDoc.id : null;
    
    // Log da operação
    logger.info('Empréstimos do cliente listados', {
      usuarioId: usuarioId,
      clienteId: clienteId,
      totalRetornado: emprestimos.length,
      pagina: pagina
    });
    
    // Retornar dados com metadados de paginação
    return {
      data: emprestimos,
      meta: {
        total: total,
        pagina: pagina,
        limite: limite,
        totalPaginas: Math.ceil(total / limite),
        proximaPagina: nextPageToken ? pagina + 1 : null,
        ultimoDocId: nextPageToken,
        clienteId: clienteId
      }
    };
  } catch (error) {
    logger.error('Erro ao listar empréstimos do cliente', {
      error: error.message,
      usuarioId: usuarioId,
      clienteId: clienteId
    });
    throw new HttpsError('internal', `Erro ao listar empréstimos: ${error.message}`);
  }
});

// FUNÇÃO PARA ATUALIZAR UM CLIENTE (MIGRADA PARA CALLABLE)
exports.atualizarCliente = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (apenas admin, gerente e vendedor podem atualizar clientes)
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN, 
    CONFIG.PERFIS_USUARIO.GERENTE, 
    CONFIG.PERFIS_USUARIO.VENDEDOR
  ]);
  
  // Valida dados obrigatórios
  validarDados(data, ['clienteId']);
  
  const clienteId = data.clienteId;
  const dadosAtualizados = { ...data };
  
  // Remove o clienteId dos dados a serem atualizados
  delete dadosAtualizados.clienteId;
  
  // Validações específicas
  if (dadosAtualizados.cpf && !validarCPF(dadosAtualizados.cpf)) {
    throw new HttpsError('invalid-argument', 'CPF inválido');
  }
  
  if (dadosAtualizados.telefone && !validarTelefone(dadosAtualizados.telefone)) {
    throw new HttpsError('invalid-argument', 'Telefone inválido');
  }
  
  // Limpa o CPF se fornecido
  if (dadosAtualizados.cpf) {
    dadosAtualizados.cpf = dadosAtualizados.cpf.replace(/[^\d]/g, '');
  }

  // Adiciona campos de auditoria
  dadosAtualizados.dataAtualizacao = FieldValue.serverTimestamp();
  dadosAtualizados.usuarioAtualizacaoId = usuarioId;

  try {
    // Verifica se o cliente existe
    const docRef = db.collection('clientes').doc(clienteId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      throw new HttpsError('not-found', 'Cliente não encontrado');
    }
    
    // Atualiza o documento do cliente
    await docRef.update(dadosAtualizados);
    
    // Log da operação
    logger.info('Cliente atualizado', {
      usuarioId: usuarioId,
      clienteId: clienteId,
      camposAtualizados: Object.keys(dadosAtualizados).filter(k => k !== 'dataAtualizacao' && k !== 'usuarioAtualizacaoId')
    });
    
    // Retorna sucesso
    return {
      message: 'Cliente atualizado com sucesso!',
      clienteId: clienteId
    };
  } catch (error) {
    logger.error('Erro ao atualizar cliente', {
      error: error.message,
      usuarioId: usuarioId,
      clienteId: clienteId
    });
    throw new HttpsError('internal', `Erro ao atualizar cliente: ${error.message}`);
  }
});

// FUNÇÃO PARA EXCLUIR UM CLIENTE (MIGRADA PARA CALLABLE)
exports.excluirCliente = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (apenas admin e gerente podem excluir clientes)
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN, 
    CONFIG.PERFIS_USUARIO.GERENTE
  ]);
  
  // Valida dados obrigatórios
  validarDados(data, ['clienteId']);
  
  const clienteId = data.clienteId;

  try {
    // Verifica se o cliente existe
    const docRef = db.collection('clientes').doc(clienteId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      throw new HttpsError('not-found', 'Cliente não encontrado');
    }
    
    // Exclui as subcoleções do cliente usando a função auxiliar para lidar com grandes volumes
    logger.info('Iniciando exclusão de subcoleções do cliente', {
      usuarioId: usuarioId,
      clienteId: clienteId
    });
    
    // Exclui empréstimos em lotes
    const emprestimosExcluidos = await excluirSubcolecaoEmLotes(docRef, 'emprestimos');
    
    // Exclui documentos em lotes
    const documentosExcluidos = await excluirSubcolecaoEmLotes(docRef, 'documentos');
    
    // Exclui o documento do cliente
    await docRef.delete();
    
    // Log da operação
    logger.info('Cliente excluído com sucesso', {
      usuarioId: usuarioId,
      clienteId: clienteId,
      emprestimosExcluidos: emprestimosExcluidos,
      documentosExcluidos: documentosExcluidos
    });
    
    // Retorna sucesso
    return {
      message: 'Cliente excluído com sucesso!',
      clienteId: clienteId,
      emprestimosExcluidos: emprestimosExcluidos,
      documentosExcluidos: documentosExcluidos
    };
  } catch (error) {
    logger.error('Erro ao excluir cliente', {
      error: error.message,
      usuarioId: usuarioId,
      clienteId: clienteId
    });
    throw new HttpsError('internal', `Erro ao excluir cliente: ${error.message}`);
  }
});

// FUNÇÃO PARA MOVER CLIENTE NO FUNIL (MIGRADA PARA CALLABLE)
exports.moverClienteNoFunil = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (apenas admin, gerente e vendedor podem mover clientes no funil)
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN, 
    CONFIG.PERFIS_USUARIO.GERENTE, 
    CONFIG.PERFIS_USUARIO.VENDEDOR
  ]);
  
  // Valida dados obrigatórios
  validarDados(data, ['clienteId', 'novaEtapa']);
  
  const { clienteId, novaEtapa } = data;
  
  // Valida a nova etapa do funil
  if (!etapasValidas.includes(novaEtapa)) {
    throw new HttpsError(
      'invalid-argument',
      `Etapa inválida. Etapas válidas: ${etapasValidas.join(', ')}`
    );
  }

  try {
    // Obtém o documento do cliente
    const docRef = db.collection('clientes').doc(clienteId);
    const doc = await docRef.get();
    
    // Verifica se o cliente existe
    if (!doc.exists) {
      throw new HttpsError('not-found', 'Cliente não encontrado');
    }
    
    // Obtém a etapa atual do cliente
    const etapaAtual = doc.data().etapaFunil;
    
    // Se a etapa atual for igual à nova etapa, não faz nada
    if (etapaAtual === novaEtapa) {
      return {
        message: 'Cliente já está nesta etapa do funil',
        clienteId: clienteId,
        etapaAtual: etapaAtual
      };
    }
    
    // Atualiza a etapa do funil e registra o histórico de movimentação
    await docRef.update({
      etapaFunil: novaEtapa,
      dataAtualizacao: FieldValue.serverTimestamp(),
      // Adiciona um registro ao array de histórico de movimentação
      historicoMovimentacao: FieldValue.arrayUnion({
        de: etapaAtual,
        para: novaEtapa,
        data: FieldValue.serverTimestamp(),
        usuarioId: usuarioId
      })
    });
    
    // Log da operação
    logger.info('Cliente movido no funil', {
      usuarioId: usuarioId,
      clienteId: clienteId,
      etapaAnterior: etapaAtual,
      etapaNova: novaEtapa
    });
    
    // Retorna sucesso
    return {
      message: 'Cliente movido no funil com sucesso!',
      clienteId: clienteId,
      etapaAnterior: etapaAtual,
      etapaAtual: novaEtapa
    };
  } catch (error) {
    logger.error('Erro ao mover cliente no funil', {
      error: error.message,
      usuarioId: usuarioId,
      clienteId: clienteId,
      novaEtapa: novaEtapa
    });
    throw new HttpsError('internal', `Erro ao mover cliente no funil: ${error.message}`);
  }
});

// FUNÇÃO PARA LISTAR CLIENTES POR ETAPA DO FUNIL (MIGRADA PARA CALLABLE COM PAGINAÇÃO)
exports.listarClientesPorEtapa = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (todos os perfis podem listar clientes por etapa)
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN, 
    CONFIG.PERFIS_USUARIO.GERENTE, 
    CONFIG.PERFIS_USUARIO.VENDEDOR,
    CONFIG.PERFIS_USUARIO.SUPORTE
  ]);
  
  // Valida dados obrigatórios
  validarDados(data, ['etapa']);
  
  const etapa = data.etapa;
  const limite = data?.limite || CONFIG.LIMITE_PAGINACAO_PADRAO;
  const pagina = data?.pagina || 1;
  const ultimoDocId = data?.ultimoDocId || null;
  
  // Validação de paginação
  validarPaginacao(pagina, ultimoDocId);
  
  // Valida a etapa do funil
  if (!etapasValidas.includes(etapa)) {
    throw new HttpsError(
      'invalid-argument',
      `Etapa inválida. Etapas válidas: ${etapasValidas.join(', ')}`
    );
  }

  try {
    // Criar query base
    let query = db.collection('clientes').where('etapaFunil', '==', etapa);
    
    // Ordenação
    query = query.orderBy('dataCriacao', 'desc');
    
    // Aplicar cursor se fornecido
    if (ultimoDocId) {
      const docRef = db.collection('clientes').doc(ultimoDocId);
      const doc = await docRef.get();
      if (doc.exists) {
        query = query.startAfter(doc);
      }
    } else if (pagina > 1) {
      // Se não tiver cursor mas tiver página, calcular skip
      const skipCount = (pagina - 1) * limite;
      const skipSnapshot = await db.collection('clientes')
                                 .where('etapaFunil', '==', etapa)
                                 .orderBy('dataCriacao', 'desc')
                                 .limit(skipCount)
                                 .get();
      const lastDoc = skipSnapshot.docs[skipSnapshot.docs.length - 1];
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
    }
    
    // Aplicar limite
    query = query.limit(limite);
    
    // Executar query
    const snapshot = await query.get();
    
    // Obter total de documentos na etapa (para metadados de paginação)
    const totalSnapshot = await db.collection('clientes')
                                .where('etapaFunil', '==', etapa)
                                .count()
                                .get();
    const total = totalSnapshot.data().count;
    
    // Preparar dados
    const clientes = [];
    snapshot.forEach(doc => {
      clientes.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Preparar metadados de paginação
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const nextPageToken = lastDoc ? lastDoc.id : null;
    
    // Log da operação
    logger.info('Clientes listados por etapa', {
      usuarioId: usuarioId,
      etapa: etapa,
      totalRetornado: clientes.length,
      pagina: pagina
    });
    
    // Retornar dados com metadados de paginação
    return {
      data: clientes,
      meta: {
        total: total,
        pagina: pagina,
        limite: limite,
        totalPaginas: Math.ceil(total / limite),
        proximaPagina: nextPageToken ? pagina + 1 : null,
        ultimoDocId: nextPageToken,
        etapa: etapa
      }
    };
  } catch (error) {
    logger.error('Erro ao listar clientes por etapa', {
      error: error.message,
      usuarioId: usuarioId,
      etapa: etapa
    });
    throw new HttpsError('internal', `Erro ao listar clientes por etapa: ${error.message}`);
  }
});

// FUNÇÃO PARA CRIAR UM AGENDAMENTO (MIGRADA PARA CALLABLE)
exports.criarAgendamento = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (apenas admin, gerente e vendedor podem criar agendamentos)
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN, 
    CONFIG.PERFIS_USUARIO.GERENTE, 
    CONFIG.PERFIS_USUARIO.VENDEDOR
  ]);
  
  // Valida dados obrigatórios
  validarDados(data, ['clienteId', 'data', 'titulo']);
  
  const { clienteId, titulo, descricao, data: dataAgendamento } = data;

  try {
    // Verifica se o cliente existe
    const clienteRef = db.collection('clientes').doc(clienteId);
    const clienteDoc = await clienteRef.get();
    
    if (!clienteDoc.exists) {
      throw new HttpsError('not-found', 'Cliente não encontrado');
    }
    
    // Converte a string de data para objeto Date
    const dataObj = new Date(dataAgendamento);
    
    // Verifica se a data é válida
    if (isNaN(dataObj.getTime())) {
      throw new HttpsError('invalid-argument', 'Data inválida');
    }
    
    // Prepara os dados para salvar no Firestore
    const agendamentoParaFirestore = {
      clienteId: clienteId,
      titulo: titulo,
      descricao: descricao || '',
      data: dataObj,
      concluido: false,
      dataCriacao: FieldValue.serverTimestamp(),
      usuarioCriacaoId: usuarioId
    };
    
    // Adiciona o agendamento à coleção 'agendamentos'
    const docRef = await db.collection('agendamentos').add(agendamentoParaFirestore);
    
    // Log da operação
    logger.info('Agendamento criado', {
      usuarioId: usuarioId,
      clienteId: clienteId,
      agendamentoId: docRef.id,
      data: dataObj
    });
    
    // Retorna sucesso
    return {
      message: 'Agendamento criado com sucesso!',
      agendamentoId: docRef.id
    };
  } catch (error) {
    logger.error('Erro ao criar agendamento', {
      error: error.message,
      usuarioId: usuarioId,
      clienteId: clienteId
    });
    throw new HttpsError('internal', `Erro ao criar agendamento: ${error.message}`);
  }
});

// FUNÇÃO PARA LISTAR AGENDAMENTOS DE UM CLIENTE (MIGRADA PARA CALLABLE COM PAGINAÇÃO)
exports.listarAgendamentosCliente = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (todos os perfis podem listar agendamentos)
  await verificarPermissao(usuarioId, [
    CONFIG.PERFIS_USUARIO.ADMIN, 
    CONFIG.PERFIS_USUARIO.GERENTE, 
    CONFIG.PERFIS_USUARIO.VENDEDOR,
    CONFIG.PERFIS_USUARIO.SUPORTE
  ]);
  
  // Valida dados obrigatórios
  validarDados(data, ['clienteId']);
  
  const clienteId = data.clienteId;
  const limite = data?.limite || CONFIG.LIMITE_PAGINACAO_PADRAO;
  const pagina = data?.pagina || 1;
  const ultimoDocId = data?.ultimoDocId || null;
  const incluirConcluidos = data?.incluirConcluidos || false;
  
  // Validação de paginação
  validarPaginacao(pagina, ultimoDocId);

  try {
    // Verifica se o cliente existe
    const clienteRef = db.collection('clientes').doc(clienteId);
    const clienteDoc = await clienteRef.get();
    
    if (!clienteDoc.exists) {
      throw new HttpsError('not-found', 'Cliente não encontrado');
    }
    
    // Criar query base
    let query = db.collection('agendamentos').where('clienteId', '==', clienteId);
    
    // Filtrar por status de conclusão se necessário
    if (!incluirConcluidos) {
      query = query.where('concluido', '==', false);
    }
    
    // Ordenação
    query = query.orderBy('data', 'asc');
    
    // Aplicar cursor se fornecido
    if (ultimoDocId) {
      const docRef = db.collection('agendamentos').doc(ultimoDocId);
      const doc = await docRef.get();
      if (doc.exists) {
        query = query.startAfter(doc);
      }
    } else if (pagina > 1) {
      // Se não tiver cursor mas tiver página, calcular skip
      let skipQuery = db.collection('agendamentos')
                      .where('clienteId', '==', clienteId)
                      .orderBy('data', 'asc');
      
      if (!incluirConcluidos) {
        skipQuery = skipQuery.where('concluido', '==', false);
      }
      
      const skipCount = (pagina - 1) * limite;
      const skipSnapshot = await skipQuery.limit(skipCount).get();
      const lastDoc = skipSnapshot.docs[skipSnapshot.docs.length - 1];
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
    }
    
    // Aplicar limite
    query = query.limit(limite);
    
    // Executar query
    const snapshot = await query.get();
    
    // Obter total de agendamentos do cliente (para metadados de paginação)
    let countQuery = db.collection('agendamentos')
                     .where('clienteId', '==', clienteId);
    
    if (!incluirConcluidos) {
      countQuery = countQuery.where('concluido', '==', false);
    }
    
    const totalSnapshot = await countQuery.count().get();
    const total = totalSnapshot.data().count;
    
    // Preparar dados
    const agendamentos = [];
    snapshot.forEach(doc => {
      agendamentos.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Preparar metadados de paginação
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const nextPageToken = lastDoc ? lastDoc.id : null;
    
    // Log da operação
    logger.info('Agendamentos do cliente listados', {
      usuarioId: usuarioId,
      clienteId: clienteId,
      totalRetornado: agendamentos.length,
      incluirConcluidos: incluirConcluidos
    });
    
    // Retornar dados com metadados de paginação
    return {
      data: agendamentos,
      meta: {
        total: total,
        pagina: pagina,
        limite: limite,
        totalPaginas: Math.ceil(total / limite),
        proximaPagina: nextPageToken ? pagina + 1 : null,
        ultimoDocId: nextPageToken,
        clienteId: clienteId,
        incluirConcluidos: incluirConcluidos
      }
    };
  } catch (error) {
    logger.error('Erro ao listar agendamentos', {
      error: error.message,
      usuarioId: usuarioId,
      clienteId: clienteId
    });
    throw new HttpsError('internal', `Erro ao listar agendamentos: ${error.message}`);
  }
});

// ===== FUNÇÃO AGENDADA ATUALIZADA (V2) ===== //
exports.atualizarPrazoRestanteScheduled = onSchedule({
  schedule: '0 0 10 * *',  // Dia 10 de cada mês, 00:00 (meia-noite)
  timeZone: 'America/Sao_Paulo',
  retryCount: 3
}, async (event) => {
  logger.log("[AGENDADOR] Iniciando atualização automática de prazos...");

  try {
    // Obtém clientes com empréstimos ativos
    const snapshot = await db.collection('clientes')
      .where('prazoRestante', '>', 0)
      .get();

    // Batch para atualização em lote
    let batch = db.batch();
    let batchCount = 0;
    let clientesAtualizados = 0;

    const hoje = new Date();

    for (const doc of snapshot.docs) {
      const cliente = doc.data();
      if (!cliente.dataPrimeiroDesconto) continue;

      // Cálculo do prazo restante
      const dataInicio = cliente.dataPrimeiroDesconto.toDate();
      const mesesDecorridos = (hoje.getFullYear() - dataInicio.getFullYear()) * 12 + 
                            hoje.getMonth() - dataInicio.getMonth();
      const novoRestante = Math.max(0, cliente.prazoContratado - mesesDecorridos);
      const parcelasPagas = cliente.prazoContratado - novoRestante;
      const alertaRecorrencia = parcelasPagas >= 11;

      // Atualiza o documento
      batch.update(doc.ref, {
        prazoRestante: novoRestante,
        parcelasPagas: parcelasPagas,
        percentualPago: (parcelasPagas / cliente.prazoContratado) * 100,
        alertaRecorrencia: alertaRecorrencia,
        ultimaAtualizacaoPrazo: FieldValue.serverTimestamp()
      });

      batchCount++;
      clientesAtualizados++;

      // Executa o batch a cada 450 operações (limite seguro)
      if (batchCount >= 450) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    // Executa o último batch se necessário
    if (batchCount > 0) await batch.commit();

    logger.log(`[AGENDADOR] Concluído! ${clientesAtualizados} clientes atualizados.`);

  } catch (error) {
    logger.error("[AGENDADOR] ERRO:", error);
    throw error;
  }
});

// FUNÇÃO HTTP PARA ATUALIZAR PRAZO RESTANTE MANUALMENTE (PARA TESTES)
exports.atualizarPrazoRestanteManual = onCall(async (data, context) => {
  // Valida autenticação com permissão de administrador
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (apenas admin pode executar esta função)
  await verificarPermissao(usuarioId, [CONFIG.PERFIS_USUARIO.ADMIN]);
  
  try {
    // Obtém todos os clientes com empréstimos ativos
    const snapshot = await db.collection('clientes')
      .where('prazoRestante', '>', 0)
      .get();
    
    // Cria um batch para operações em lote
    const batch = db.batch();
    let batchCount = 0;
    let clientesAtualizados = 0;
    let totalBatches = 0;
    
    // Data atual
    const hoje = new Date();
    
    // Processa cada cliente
    for (const doc of snapshot.docs) {
      const cliente = doc.data();
      
      // Verifica se tem data de primeiro desconto
      if (!cliente.dataPrimeiroDesconto) {
        continue; // Pula este cliente
      }
      
      // Calcula o prazo restante em meses
      const dataInicio = cliente.dataPrimeiroDesconto.toDate ? 
                        cliente.dataPrimeiroDesconto.toDate() : 
                        new Date(cliente.dataPrimeiroDesconto);
      
      const mesesDecorridos = (hoje.getFullYear() - dataInicio.getFullYear()) * 12 + 
                              hoje.getMonth() - dataInicio.getMonth();
      
      const novoRestante = Math.max(0, cliente.prazoContratado - mesesDecorridos);
      
      // Calcula as parcelas pagas
      const parcelasPagas = cliente.prazoContratado - novoRestante;
      
      // Verifica se atingiu o limite para alerta de recorrência (11 parcelas pagas)
      const alertaRecorrencia = parcelasPagas >= 11;
      
      // Atualiza o documento
      batch.update(doc.ref, {
        prazoRestante: novoRestante,
        parcelasPagas: parcelasPagas,
        percentualPago: (parcelasPagas / cliente.prazoContratado) * 100,
        alertaRecorrencia: alertaRecorrencia,
        ultimaAtualizacaoPrazo: FieldValue.serverTimestamp()
      });
      
      batchCount++;
      clientesAtualizados++;
      
      // Se atingir o limite de operações por batch, executa e cria um novo batch
      if (batchCount >= CONFIG.LIMITE_BATCH_OPERACOES) {
        await batch.commit();
        totalBatches++;
        batch = db.batch();
        batchCount = 0;
        
        logger.info(`Batch ${totalBatches} de atualização manual de prazo concluído`);
      }
    }
    
    // Executa o último batch se houver operações pendentes
    if (batchCount > 0) {
      await batch.commit();
      totalBatches++;
    }
    
    logger.info('Atualização manual de prazo restante concluída', {
      usuarioId: usuarioId,
      clientesAtualizados: clientesAtualizados,
      totalBatches: totalBatches
    });
    
    return {
      message: 'Atualização de prazo restante concluída com sucesso!',
      clientesAtualizados: clientesAtualizados
    };
  } catch (error) {
    logger.error('Erro ao atualizar prazo restante manualmente', {
      error: error.message,
      usuarioId: usuarioId
    });
    throw new HttpsError('internal', `Erro ao atualizar prazo restante: ${error.message}`);
  }
});

// FUNÇÃO PARA CRIAR USUÁRIO (APENAS ADMIN PODE CRIAR OUTROS USUÁRIOS)
exports.criarUsuario = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (apenas admin pode criar usuários)
  await verificarPermissao(usuarioId, [CONFIG.PERFIS_USUARIO.ADMIN]);
  
  // Valida dados obrigatórios
  validarDados(data, ['email', 'senha', 'nome', 'perfil']);
  
  const { email, senha, nome, perfil } = data;
  
  // Valida o perfil
  const perfisValidos = Object.values(CONFIG.PERFIS_USUARIO);
  if (!perfisValidos.includes(perfil)) {
    throw new HttpsError(
      'invalid-argument',
      `Perfil inválido. Perfis válidos: ${perfisValidos.join(', ')}`
    );
  }
  
  try {
    // Cria o usuário no Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email: email,
      password: senha,
      displayName: nome,
      emailVerified: true
    });
    
    // Define claims personalizadas para o usuário
    await admin.auth().setCustomUserClaims(userRecord.uid, { 
      [perfil]: true 
    });
    
    // Adiciona o perfil do usuário no Firestore
    await db.collection('usuarios').doc(userRecord.uid).set({
      nome: nome,
      email: email,
      perfil: perfil,
      dataCriacao: FieldValue.serverTimestamp(),
      usuarioCriacaoId: usuarioId,
      ativo: true,
      uid: userRecord.uid
    });
    
    // Log da operação
    logger.info('Usuário criado', {
      usuarioId: usuarioId,
      novoUsuarioId: userRecord.uid,
      email: email,
      perfil: perfil
    });
    
    // Retorna sucesso
    return {
      message: 'Usuário criado com sucesso!',
      usuarioId: userRecord.uid
    };
  } catch (error) {
    logger.error('Erro ao criar usuário', {
      error: error.message,
      usuarioId: usuarioId,
      email: email
    });
    throw new HttpsError('internal', `Erro ao criar usuário: ${error.message}`);
  }
});

// FUNÇÃO PARA LISTAR USUÁRIOS (APENAS ADMIN PODE LISTAR USUÁRIOS)
exports.listarUsuarios = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (apenas admin pode listar usuários)
  await verificarPermissao(usuarioId, [CONFIG.PERFIS_USUARIO.ADMIN]);
  
  try {
    // Parâmetros de paginação
    const limite = data?.limite || CONFIG.LIMITE_PAGINACAO_PADRAO;
    const pagina = data?.pagina || 1;
    const ultimoDocId = data?.ultimoDocId || null;
    
    // Validação de paginação
    validarPaginacao(pagina, ultimoDocId);
    
    // Criar query base
    let query = db.collection('usuarios').orderBy('dataCriacao', 'desc');
    
    // Aplicar cursor se fornecido
    if (ultimoDocId) {
      const docRef = db.collection('usuarios').doc(ultimoDocId);
      const doc = await docRef.get();
      if (doc.exists) {
        query = query.startAfter(doc);
      }
    } else if (pagina > 1) {
      // Se não tiver cursor mas tiver página, calcular skip
      const skipCount = (pagina - 1) * limite;
      const skipSnapshot = await db.collection('usuarios')
                                 .orderBy('dataCriacao', 'desc')
                                 .limit(skipCount)
                                 .get();
      const lastDoc = skipSnapshot.docs[skipSnapshot.docs.length - 1];
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
    }
    
    // Aplicar limite
    query = query.limit(limite);
    
    // Executar query
    const snapshot = await query.get();
    
    // Obter total de usuários (para metadados de paginação)
    const totalSnapshot = await db.collection('usuarios').count().get();
    const total = totalSnapshot.data().count;
    
    // Preparar dados
    const usuarios = [];
    snapshot.forEach(doc => {
      // Não incluir a senha nos dados retornados
      const userData = doc.data();
      delete userData.senha;
      
      usuarios.push({
        id: doc.id,
        ...userData
      });
    });
    
    // Preparar metadados de paginação
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const nextPageToken = lastDoc ? lastDoc.id : null;
    
    // Log da operação
    logger.info('Usuários listados', {
      usuarioId: usuarioId,
      totalRetornado: usuarios.length
    });
    
    // Retornar dados com metadados de paginação
    return {
      data: usuarios,
      meta: {
        total: total,
        pagina: pagina,
        limite: limite,
        totalPaginas: Math.ceil(total / limite),
        proximaPagina: nextPageToken ? pagina + 1 : null,
        ultimoDocId: nextPageToken
      }
    };
  } catch (error) {
    logger.error('Erro ao listar usuários', {
      error: error.message,
      usuarioId: usuarioId
    });
    throw new HttpsError('internal', `Erro ao listar usuários: ${error.message}`);
  }
});

// FUNÇÃO PARA ATUALIZAR USUÁRIO (APENAS ADMIN PODE ATUALIZAR USUÁRIOS)
exports.atualizarUsuario = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  // Verifica permissão (apenas admin pode atualizar usuários)
  await verificarPermissao(usuarioId, [CONFIG.PERFIS_USUARIO.ADMIN]);
  
  // Valida dados obrigatórios
  validarDados(data, ['usuarioId']);
  
  const { usuarioId: targetUsuarioId, nome, perfil, ativo } = data;
  
  // Valida o perfil se fornecido
  if (perfil) {
    const perfisValidos = Object.values(CONFIG.PERFIS_USUARIO);
    if (!perfisValidos.includes(perfil)) {
      throw new HttpsError(
        'invalid-argument',
        `Perfil inválido. Perfis válidos: ${perfisValidos.join(', ')}`
      );
    }
  }
  
  try {
    // Verifica se o usuário existe
    const usuarioRef = db.collection('usuarios').doc(targetUsuarioId);
    const usuarioDoc = await usuarioRef.get();
    
    if (!usuarioDoc.exists) {
      throw new HttpsError('not-found', 'Usuário não encontrado');
    }
    
    // Prepara os dados para atualização
    const dadosAtualizados = {};
    
    if (nome !== undefined) {
      dadosAtualizados.nome = nome;
      
      // Atualiza o displayName no Authentication
      await admin.auth().updateUser(targetUsuarioId, {
        displayName: nome
      });
    }
    
    if (perfil !== undefined) {
      dadosAtualizados.perfil = perfil;
      
      // Atualiza as claims no Authentication
      await admin.auth().setCustomUserClaims(targetUsuarioId, { 
        [perfil]: true 
      });
    }
    
    if (ativo !== undefined) {
      dadosAtualizados.ativo = ativo;
      
      // Desativa ou ativa o usuário no Authentication
      await admin.auth().updateUser(targetUsuarioId, {
        disabled: !ativo
      });
    }
    
    // Adiciona campos de auditoria
    dadosAtualizados.dataAtualizacao = FieldValue.serverTimestamp();
    dadosAtualizados.usuarioAtualizacaoId = usuarioId;
    
    // Atualiza o documento do usuário no Firestore
    await usuarioRef.update(dadosAtualizados);
    
    // Log da operação
    logger.info('Usuário atualizado', {
      usuarioId: usuarioId,
      targetUsuarioId: targetUsuarioId,
      camposAtualizados: Object.keys(dadosAtualizados).filter(k => k !== 'dataAtualizacao' && k !== 'usuarioAtualizacaoId')
    });
    
    // Retorna sucesso
    return {
      message: 'Usuário atualizado com sucesso!',
      usuarioId: targetUsuarioId
    };
  } catch (error) {
    logger.error('Erro ao atualizar usuário', {
      error: error.message,
      usuarioId: usuarioId,
      targetUsuarioId: targetUsuarioId
    });
    throw new HttpsError('internal', `Erro ao atualizar usuário: ${error.message}`);
  }
});

// FUNÇÃO PARA OBTER PERFIL DO USUÁRIO ATUAL
exports.obterPerfilUsuario = onCall(async (data, context) => {
  // Valida autenticação
  const usuarioId = await validarAutenticacao(context);
  
  try {
    // Obtém o documento do usuário
    const usuarioRef = db.collection('usuarios').doc(usuarioId);
    const usuarioDoc = await usuarioRef.get();
    
    // Verifica se o usuário é o usuário master (admin) configurado
    if (!usuarioDoc.exists) {
      // Se o documento não existe, verifica se é o primeiro acesso do usuário master
      const usuarioAuth = await admin.auth().getUser(usuarioId);
      
      // Se o email corresponder ao usuário master configurado, cria o perfil automaticamente
      if (usuarioAuth.email === CONFIG.USUARIO_MASTER.EMAIL) {
        // Cria o documento do usuário master com perfil de admin
        const dadosUsuarioMaster = {
          nome: CONFIG.USUARIO_MASTER.NOME,
          email: CONFIG.USUARIO_MASTER.EMAIL,
          perfil: CONFIG.USUARIO_MASTER.PERFIL,
          dataCriacao: FieldValue.serverTimestamp(),
          ativo: true,
          uid: usuarioId
        };
        
        await usuarioRef.set(dadosUsuarioMaster);
        
        logger.info('Perfil de usuário master criado automaticamente', {
          usuarioId: usuarioId,
          email: CONFIG.USUARIO_MASTER.EMAIL
        });
        
        // Retorna o perfil do usuário master
        return {
          id: usuarioId,
          ...dadosUsuarioMaster,
          isMaster: true
        };
      } else {
        throw new HttpsError(
          'not-found',
          'Perfil de usuário não encontrado'
        );
      }
    }
    
    // Retorna os dados do usuário
    const userData = usuarioDoc.data();
    
    // Verifica se é o usuário master
    const isMaster = userData.email === CONFIG.USUARIO_MASTER.EMAIL;
    
    // Log da operação
    logger.info('Perfil de usuário obtido', {
      usuarioId: usuarioId
    });
    
    return {
      id: usuarioDoc.id,
      ...userData,
      isMaster: isMaster
    };
  } catch (error) {
    logger.error('Erro ao obter perfil de usuário', {
      error: error.message,
      usuarioId: usuarioId
    });
    throw new HttpsError('internal', `Erro ao obter perfil de usuário: ${error.message}`);
  }
});

// FUNÇÃO PARA LISTAR CLIENTES COM PAGINAÇÃO EFICIENTE (startAfter)
exports.listarClientesNovaPaginacao = onCall(async (data, context) => {
  try {
    // Valida autenticação
    const usuarioId = await validarAutenticacao(context);
    // Verifica permissão
    await verificarPermissao(usuarioId, [CONFIG.PERFIS_USUARIO.ADMIN]);

    const { limite = 10, ultimoDocId = null } = data || {};

    let query = db.collection('clientes').orderBy('dataCriacao', 'desc');

    if (ultimoDocId) {
      const snapshot = await db.collection('clientes').doc(ultimoDocId).get();
      if (snapshot.exists) {
        query = query.startAfter(snapshot);
      }
    }

    const snapshot = await query.limit(limite).get();

    const clientes = [];
    snapshot.forEach(doc => {
      clientes.push({ id: doc.id, ...doc.data() });
    });

    const hasNext = snapshot.size === limite;

    return {
      clientes,
      nextPageToken: hasNext ? snapshot.docs[snapshot.docs.length - 1].id : null
    };
  } catch (error) {
    logger.error('Erro na nova paginação', { error: error.message });
    throw new HttpsError('internal', 'Erro ao listar clientes');
  }
});
// Exporta as configurações para uso em outros módulos
exports.CONFIG = CONFIG;