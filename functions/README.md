# CRM Souzacred - Sistema Completo

## Visão Geral

O CRM Souzacred é um sistema completo de gerenciamento de relacionamento com clientes desenvolvido com Firebase, incluindo autenticação, funil de vendas, agendamentos e relatórios.

## Funcionalidades Implementadas

### ✅ Autenticação e Autorização
- Sistema de login com Firebase Auth
- Controle de acesso baseado em perfis (RBAC)
- Perfis: Admin, Gerente, Vendedor, Suporte
- Usuário master configurado: `marcos.sen@hotmail.com`

### ✅ Backend (Cloud Functions)
- **Métricas do Dashboard**: `obterMetricasDashboard`
- **Gestão de Clientes**: 
  - `adicionarCliente`
  - `listarClientes` (com paginação)
  - `buscarClientes`
  - `obterCliente`
  - `atualizarCliente`
  - `excluirCliente`
- **Funil de Vendas**:
  - `moverClienteNoFunil`
  - `listarClientesPorEtapa`
- **Agendamentos**:
  - `criarAgendamento`
  - `listarAgendamentos`
- **Gestão de Usuários**:
  - `criarUsuario`
  - `listarUsuarios`
  - `atualizarUsuario`
  - `obterPerfilUsuario`
- **Funções Agendadas**:
  - `atualizarPrazoRestanteScheduled` (execução diária)
  - `atualizarPrazoRestanteManual`

### ✅ Frontend
- Dashboard com métricas em tempo real
- Funil de vendas interativo
- Lista de clientes recentes
- Interface responsiva com Tailwind CSS
- Integração completa com Firebase Auth
- Chamadas reais para o backend (sem dados mockados)

### ✅ Estrutura de Dados
- **Clientes**: CPF, telefone, endereço, etapa do funil, histórico
- **Empréstimos**: Valor, parcelas, taxa de juros, status
- **Agendamentos**: Data, tipo, status, observações
- **Usuários**: Nome, email, perfil, permissões

## Configuração e Implantação

### 1. Pré-requisitos
```bash
npm install -g firebase-tools
```

### 2. Configuração do Firebase
```bash
# Login no Firebase
firebase login

# Inicializar projeto (se necessário)
firebase init

# Configurar projeto
firebase use crm-com-api
```

### 3. Instalação de Dependências
```bash
cd functions
npm install
```

### 4. Deploy das Cloud Functions
```bash
# Deploy de todas as funções
firebase deploy --only functions

# Deploy de função específica
firebase deploy --only functions:obterMetricasDashboard
```

### 5. Deploy do Frontend
```bash
# Deploy do hosting
firebase deploy --only hosting
```

### 6. Configuração do Usuário Master
O usuário master (`marcos.sen@hotmail.com`) será criado automaticamente no primeiro login. Para criar o usuário no Firebase Auth:

```bash
# Via Firebase Console ou programaticamente
# O perfil será criado automaticamente pela função verificarPermissao
```

## Estrutura do Projeto

```
functions/
├── index.js                 # Cloud Functions principais
├── index.html              # Dashboard principal
├── login.html              # Página de login
├── package.json             # Dependências
├── agendamentos/           # Funções de agendamento
├── clientes/               # Funções de clientes
├── emprestimos/            # Funções de empréstimos
├── usuarios/               # Funções de usuários
└── utils/                  # Utilitários
```

## Configurações de Segurança

### Regras do Firestore
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Apenas usuários autenticados podem acessar
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Regras do Firebase Auth
- Apenas administradores podem criar novos usuários
- Controle de acesso baseado em custom claims
- Verificação de permissões em todas as funções

## Monitoramento e Logs

### Cloud Functions Logs
```bash
# Visualizar logs
firebase functions:log

# Logs de função específica
firebase functions:log --only obterMetricasDashboard
```

### Métricas do Firebase
- Acesse o Firebase Console
- Navegue para Functions > Métricas
- Monitore execuções, erros e latência

## Funcionalidades Futuras (TODO)

### Backend
- [ ] Função para atividades recentes (`obterAtividadesRecentes`)
- [ ] Função para dados de performance (`obterDadosPerformance`)
- [ ] Função para detalhes do cliente (`obterDetalhesCliente`)
- [ ] Cálculo de métricas de crescimento mensal
- [ ] Sistema de notificações
- [ ] Relatórios avançados
- [ ] Integração com WhatsApp API
- [ ] Backup automático de dados

### Frontend
- [ ] Página de gestão de clientes
- [ ] Página de agendamentos
- [ ] Página de relatórios
- [ ] Configurações do sistema
- [ ] Perfil do usuário
- [ ] Notificações em tempo real
- [ ] Modo escuro
- [ ] PWA (Progressive Web App)

## Comandos Úteis

```bash
# Executar localmente
firebase emulators:start

# Testar funções localmente
firebase functions:shell

# Backup do Firestore
gcloud firestore export gs://crm-com-api-backup

# Restaurar backup
gcloud firestore import gs://crm-com-api-backup/[EXPORT_PREFIX]
```

## Suporte

Para suporte técnico ou dúvidas sobre implementação:
- Email: marcos.sen@hotmail.com
- Documentação: [Firebase Docs](https://firebase.google.com/docs)

## Licença

Este projeto é propriedade da Souzacred e está protegido por direitos autorais.