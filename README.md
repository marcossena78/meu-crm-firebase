# CRM Souzacred - Sistema Completo com Firebase

## Visão Geral

O CRM Souzacred é um sistema completo de gerenciamento de relacionamento com clientes (CRM) desenvolvido utilizando a plataforma Firebase. Ele inclui funcionalidades essenciais como autenticação de usuários, gestão de clientes, funil de vendas interativo, agendamentos e relatórios.

Este projeto utiliza Firebase Hosting para o frontend (interface do usuário) e Firebase Cloud Functions (Node.js) para o backend (lógica de negócio e APIs).

## Funcionalidades Principais

*   **Autenticação e Autorização:**
    *   Login seguro com Firebase Authentication.
    *   Controle de acesso baseado em perfis (RBAC): Admin, Gerente, Vendedor, Suporte.
    *   Usuário master pré-configurado (`marcos.sen@hotmail.com`).
*   **Backend (Cloud Functions - Node.js):**
    *   API para métricas do Dashboard.
    *   Operações CRUD completas para gestão de clientes (adicionar, listar, buscar, obter, atualizar, excluir).
    *   Gerenciamento do funil de vendas (mover cliente entre etapas, listar por etapa).
    *   Gestão de agendamentos (criar, listar).
    *   Administração de usuários (criar, listar, atualizar, obter perfil).
    *   Funções agendadas (ex: atualização diária de prazos).
*   **Frontend (Firebase Hosting):**
    *   Dashboard dinâmico com métricas.
    *   Visualização interativa do funil de vendas.
    *   Listagem de clientes e atividades recentes.
    *   Interface responsiva (adaptável a diferentes tamanhos de tela).
    *   Integração com Firebase Authentication para login.
*   **Estrutura de Dados (Firestore):**
    *   Coleções para Clientes, Empréstimos, Agendamentos, Usuários, etc.

## Estrutura do Projeto

```
meu-crm-firebase/
├── .firebaserc           # Configuração do projeto Firebase
├── firebase.json         # Configurações de deploy (Hosting, Functions)
├── functions/            # Diretório do Backend (Cloud Functions)
│   ├── index.js          # Ponto de entrada principal das Cloud Functions
│   ├── package.json      # Dependências Node.js do backend
│   ├── README.md         # Documentação detalhada das Functions (esta que você está lendo)
│   ├── ...               # Outros arquivos e pastas do backend (HTMLs servidos pelas functions, etc)
├── README.md             # Este arquivo - Documentação principal do projeto
└── ...                   # Outros arquivos de configuração (.gitignore, etc)
```
**Observação:** Os arquivos HTML (`index.html`, `login.html`, etc.) encontrados dentro da pasta `functions` são provavelmente servidos pelo Firebase Hosting ou diretamente pelas Cloud Functions, dependendo da configuração em `firebase.json`.

## Configuração e Implantação

Siga estes passos para configurar, testar localmente e implantar o CRM Souzacred:

### 1. Pré-requisitos

*   **Node.js:** Instale uma versão compatível (verificar `engines.node` em `functions/package.json`, atualmente `22`).
*   **npm:** Geralmente instalado junto com o Node.js.
*   **Firebase CLI:** Instale globalmente:
    ```bash
    npm install -g firebase-tools
    ```

### 2. Configuração do Projeto Firebase

*   **Login:** Autentique-se na sua conta Firebase:
    ```bash
    firebase login
    ```
*   **Associação:** Na pasta raiz do projeto (`meu-crm-firebase`), associe este diretório ao seu projeto Firebase na nuvem. Substitua `SEU_PROJECT_ID` pelo ID do seu projeto no Firebase:
    ```bash
    # Se for a primeira vez, use --add para vincular
    firebase use SEU_PROJECT_ID
    # Ou, se já vinculado:
    # firebase use SEU_PROJECT_ID
    ```
    *Se você ainda não tem um projeto Firebase, crie um no [Console do Firebase](https://console.firebase.google.com/).*

### 3. Instalação das Dependências do Backend

*   Navegue até o diretório das Cloud Functions:
    ```bash
    cd functions
    ```
*   Instale as dependências Node.js:
    ```bash
    npm install
    ```
*   Volte para o diretório raiz (opcional, mas recomendado para os próximos comandos):
    ```bash
    cd ..
    ```

### 4. Execução Local com Emuladores

*   Para testar o projeto localmente antes de implantar, use os Emuladores do Firebase. Na pasta raiz do projeto:
    ```bash
    # Inicia os emuladores para Functions e Hosting
    firebase emulators:start --only functions,hosting
    ```
*   **Acesso:**
    *   Interface do CRM: `http://127.0.0.1:5000`
    *   UI dos Emuladores (logs, status): `http://127.0.0.1:4000`
*   **Observação:** Os emuladores por padrão não contêm dados. Você precisará interagir com a aplicação para criar dados ou configurar o emulador para importar/exportar dados do Firestore.

### 5. Implantação (Deploy) no Firebase

*   Após testar localmente, implante o projeto no Firebase. Certifique-se de estar na pasta raiz (`meu-crm-firebase`) e com o projeto correto selecionado (`firebase use SEU_PROJECT_ID`).
*   **Deploy das Cloud Functions (Backend):**
    ```bash
    firebase deploy --only functions
    ```
*   **Deploy do Firebase Hosting (Frontend):**
    ```bash
    firebase deploy --only hosting
    ```
*   O Firebase CLI fornecerá as URLs públicas para acessar seu CRM após o deploy bem-sucedido.

### 6. Configuração Inicial

*   **Usuário Master:** Conforme a documentação interna, o usuário `marcos.sen@hotmail.com` pode ter permissões especiais. Certifique-se de criar este usuário na seção Authentication do seu projeto no Console do Firebase para poder realizar o primeiro login.
*   **Regras de Segurança:** Revise e ajuste as regras de segurança do Firestore e Firebase Storage no Console do Firebase para garantir que apenas usuários autorizados possam acessar os dados.

## Monitoramento e Logs

*   **Logs das Functions:** Use o Firebase CLI para ver os logs em tempo real ou históricos:
    ```bash
    firebase functions:log
    ```
*   **Console do Firebase:** Monitore o uso, performance, erros e métricas dos serviços (Functions, Hosting, Firestore, Auth) diretamente no Console do Firebase.

## Funcionalidades Futuras (TODO)

Consulte o arquivo `functions/README.md` para uma lista detalhada de funcionalidades planejadas para o backend e frontend.

## Suporte

Para dúvidas ou suporte técnico relacionado a este projeto específico:
*   Email: `marcos.sen@hotmail.com` (Conforme indicado na documentação interna)
*   Para dúvidas gerais sobre Firebase: [Documentação Oficial do Firebase](https://firebase.google.com/docs)

## Licença

Conforme indicado na documentação interna, este projeto é propriedade da Souzacred e está protegido por direitos autorais.

