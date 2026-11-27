# Lovable Chat Assistant 2.0

## Instalação
1. Extraia o ZIP para uma pasta permanente.
2. Abra `chrome://extensions` (Chrome, Edge, Brave ou outro Chromium).
3. Ative **Modo do desenvolvedor**.
4. Clique **Carregar sem compactação** e selecione a pasta extraída.
5. Clique no ícone da extensão para abrir o assistente na barra lateral, ao lado do Lovable. Cada projeto Lovable lembra o repositório escolhido. Edições vão direto ao GitHub, sem usar créditos do Lovable.

Não é possível instalar automaticamente. Uma instalação em um clique exige publicação na Chrome Web Store.

## GitHub
Em Settings → Developer settings → Personal access tokens → Fine-grained tokens, crie um token limitado aos repositórios desejados, com **Contents: Read and write** e Metadata: Read. Para branches protegidas, cumpra as regras do repositório; a extensão não as contorna. Tokens de organização podem exigir aprovação. Alterações em workflows podem exigir permissão adicional Workflows. Nunca cole tokens no chat.

## Inteligência artificial
Escolha uma das conexões disponíveis nas configurações:

- **OpenRouter:** entre pela sua conta, sem copiar chave. O modo gratuito seleciona modelos gratuitos automaticamente e respeita os limites definidos pelo OpenRouter.
- **Ollama:** inicie o Ollama no computador, baixe um modelo e use **Buscar modelos instalados**. Se necessário, permita a origem da extensão em `OLLAMA_ORIGINS`.
- **LM Studio:** carregue um modelo, inicie o servidor local na aba Developer e use **Buscar modelos instalados**. Habilite CORS para a origem da extensão se necessário.
- **IA do Chrome:** disponível apenas em versões, dispositivos e configurações compatíveis; a extensão verifica a disponibilidade antes de usar.

Essas opções não pedem que a pessoa digite uma chave de API. A conexão com uma assinatura ChatGPT ainda não está disponível nesta extensão; o fluxo oficial para apps locais de código aberto exige um callback local que o pacote Manifest V3 não fornece. O fluxo também depende de plano elegível.

## Fluxo e segurança
Selecione repositório e branch. A IA seleciona arquivos e busca dependências em até três rodadas, mostra o plano e prepara conteúdos completos. Revise o diff, escolha os arquivos e confirme explicitamente o commit. Todas as alterações selecionadas são agrupadas em uma árvore e um único commit. Uma mudança externa na branch bloqueia a aplicação; o update da referência nunca usa force.

Tokens e conversas ficam em chrome.storage.local, restrito aos contextos confiáveis da extensão. Esse armazenamento **não é um cofre criptografado**: proteja seu perfil do Chrome e seu computador. Chaves não são incluídas nas mensagens ou logs. É possível substituir/remover chaves nas configurações. Não há banco externo.

Arquivos .env, chaves e certificados são bloqueados na seleção automática. Conteúdo com possíveis segredos exige autorização explícita; tokens configurados são sempre removidos. A detecção de segredos é heurística: revise anexos e código antes de autorizar. Dados do repositório são tratados como não confiáveis nas instruções dos modelos, mas nenhum prompt oferece imunidade absoluta a prompt injection. A confirmação humana e validação local permanecem obrigatórias.

## Limites e verificação
Arquivos de texto UTF-8: 160 KB por arquivo, contexto de código: 600 KB, até 40 alterações por pedido. Árvore truncada é rejeitada. Respostas incompletas/JSON inválido são rejeitadas. Geração não usa streaming; interromper cancela a requisição local, sem garantir cancelamento de cobrança no provedor. Histórico técnico é resumido pelo modelo depois de 12 mensagens. Conversas e propostas sobrevivem ao fechamento da aba; chamadas em andamento não são retomadas automaticamente, evitando commits duplicados.

A detecção Lovable usa a URL pública e o título da página, sem API interna. O vínculo com o repositório é escolhido pelo usuário; não há identificação garantida do GitHub pelo Lovable. Um commit confirmado não confirma sincronização Lovable.

A prévia web não armazena credenciais nem executa integrações: configure e use o pacote instalado. Os testes automatizados verificam validações e o protocolo de commit com respostas controladas. Testes reais de GitHub/IA dependem de credenciais do usuário configuradas na extensão; não são alegados como concluídos sem essas credenciais.

## Código-fonte
Módulos em `src/extension`: interface, armazenamento, segurança, GitHub, provedores e agente. Manifest, service worker e content script em `extension`. Execute `bun scripts/package-extension.ts` para gerar o pacote, depois de instalar dependências com `bun install`. A interface é empacotada pelo Bun para Manifest V3, sem código remoto, eval ou servidor. O aplicativo de prévia continua em TanStack Start.
