
# Gerenciador de Propostas INSS

Este é um software para gerenciamento de propostas INSS e portabilidades.

## Instruções para gerar o executável

1. Instale Python 3.8 ou superior em um ambiente Windows
2. Instale as dependências executando: pip install -r requirements.txt
3. Gere o executável com: pyinstaller optimized.spec
   ou simplesmente execute o arquivo: gerar_executavel.bat
4. O executável será gerado na pasta 'dist'

## Executando sem gerar executável

Se preferir usar a aplicação sem gerar um executável:
1. Instale Python 3.8 ou superior
2. Instale as dependências: pip install -r requirements.txt
3. Execute: python launcher.py

## Conteúdo deste pacote

- `app.py` e `app_standalone.py` - Código principal da aplicação Flask
- `launcher.py` e `launcher_standalone.py` - Scripts de inicialização
- `optimized.spec` - Configuração do PyInstaller para criar o executável
- `Templates/` - Arquivos HTML da interface do usuário
- `static/` - Arquivos CSS e outros recursos estáticos
- `gerenciador_propostas.xlsx` - Arquivo de dados
- `logo.png` - Logotipo da aplicação
- `requirements.txt` - Lista de dependências
- `gerar_executavel.bat` - Script para automatizar a geração do executável

## Requisitos

- Sistema operacional Windows (para o executável)
- Python 3.8 ou superior
- Dependências listadas em requirements.txt
