# CineMatch 🎬

Recomendações de filmes e séries **disponíveis na Netflix Brasil**, baseadas no seu gosto real:
o histórico da Netflix, um quiz de 10 perguntas ou os dois juntos.

É o primeiro módulo de um **hub pessoal**: tudo do CineMatch fica em `src/modules/cinematch`,
e o que é genérico (layout, login, componentes) fica em `src/shared`.

---

## Sumário
1. [Como rodar](#como-rodar-passo-a-passo)
2. [Como conseguir cada chave](#como-conseguir-cada-chave)
3. [Criar as tabelas no Supabase](#criar-as-tabelas-no-supabase)
4. [Ativar o login com Google](#ativar-o-login-com-google-opcional)
5. [Como testar](#como-testar)
6. [Imagens do tutorial](#imagens-do-tutorial-do-historico)
7. [Como o app funciona](#como-o-app-funciona)
8. [Mineração de dados (MovieLens)](#mineração-de-dados-movielens)
9. [Problemas comuns](#problemas-comuns)

---

## Como rodar (passo a passo)

### 1. Pré-requisitos
- **Node.js 20 ou mais novo** ([nodejs.org](https://nodejs.org), versão LTS). Confira no terminal: `node -v`.

### 2. Instalar as dependências
Na pasta do projeto, rode:
```bash
npm install
```
Isso instala o frontend **e** o backend (pasta `server/`) de uma vez.

### 3. Preencher os arquivos de configuração
Existem dois arquivos `.env`. Eles guardam as chaves e **nunca** vão para o GitHub (estão no `.gitignore`).

| Arquivo | Para quê | Modelo |
|---|---|---|
| `server/.env` | Chaves secretas (TMDB, OMDb, IA, Supabase) | `server/.env.example` |
| `.env` (raiz) | Valores públicos do navegador (Supabase URL e anon key) | `.env.example` |

Se ainda não existirem, copie os modelos:
```bash
cp .env.example .env
cp server/.env.example server/.env
```
Depois preencha cada chave seguindo a seção [Como conseguir cada chave](#como-conseguir-cada-chave).

### 4. Rodar
```bash
npm run dev
```
- Site: http://localhost:5173
- Servidor (API): http://localhost:3001/api/health
- Página de diagnóstico: http://localhost:5173/cinematch/configuracao (mostra o que já está configurado)

> **Rode o `npm run dev` em um terminal só.** Se rodar duas vezes, o segundo site abre na porta 5174
> e o segundo servidor não consegue subir ("a porta 3001 já está em uso").
>
> **Mudou algum `.env`?** Pare o terminal (`Ctrl + C`) e rode `npm run dev` de novo.

---

## Como conseguir cada chave

Todas são **gratuitas**.

### 🎞️ TMDB (obrigatório: filmes, séries e disponibilidade na Netflix)
1. Crie uma conta em [themoviedb.org](https://www.themoviedb.org/signup) e confirme o email.
2. Clique no seu avatar → **Configurações** → **API** ([link direto](https://www.themoviedb.org/settings/api)).
3. Peça uma chave do tipo **Developer**, aceite os termos e preencha o formulário
   (uso pessoal; pode colocar `http://localhost` como site).
4. Na mesma página, copie o **"Token de Leitura da API"** (*API Read Access Token*), aquele **bem longo**
   que começa com `eyJ...`. **Não** use a "Chave da API" curta.
5. Cole em `server/.env`: `TMDB_READ_TOKEN=eyJ...`

### ⭐ OMDb (opcional: notas do IMDb, Rotten Tomatoes e Metacritic)
1. Acesse [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx).
2. Escolha **FREE** (cerca de 1.000 consultas por dia), coloque seu email e envie.
3. Abra o email e clique no link de **ativação** (sem isso a chave não funciona).
4. Cole em `server/.env`: `OMDB_API_KEY=abcd1234`

> O app guarda as respostas do OMDb em cache por 7 dias, então o limite diário dificilmente é atingido.

### 📺 Trakt (opcional: séries relacionadas)
1. Entre em [trakt.tv](https://trakt.tv) e abra **Settings → Your API Apps → New Application**.
2. Dê um nome, use `http://localhost:3001/callback` como *Redirect URI* e salve.
3. Copie só o **Client ID** para `server/.env`: `TRAKT_CLIENT_ID=...` (o *Client Secret* não é usado:
   o app só lê listas públicas de séries relacionadas).

> Política de uso do Trakt: o app pede só as relacionadas das séries de cada pessoa, guarda cada lista em cache
> por 30 dias e não copia o catálogo. O rodapé traz a frase obrigatória
> "CineMatch uses Trakt but is not endorsed or certified by Trakt".

### 🤖 IA gratuita (opcional, mas recomendada): Google Gemini
1. Acesse [aistudio.google.com](https://aistudio.google.com) e entre com sua conta Google.
2. Clique em **Get API key** → **Create API key**.
3. Cole em `server/.env`: `GEMINI_API_KEY=...` (deixe `AI_PROVIDER=gemini`).

O modelo padrão é o `gemini-3.5-flash` (`GEMINI_MODEL`). Se ele estiver sobrecarregado (erro 503, comum no
plano grátis), o app tenta sozinho os modelos de `GEMINI_MODELOS_RESERVA` e depois o Groq, se houver chave.
Só depois disso ele usa as regras sem IA. Para ver quais modelos a sua chave aceita, abra o
[AI Studio](https://aistudio.google.com).

**Alternativa: Groq** (também grátis): crie a chave em [console.groq.com/keys](https://console.groq.com/keys),
cole em `GROQ_API_KEY=` e troque para `AI_PROVIDER=groq`.

**Sem IA:** use `AI_PROVIDER=none` (ou deixe sem chave). O app continua funcionando, com recomendações
por regras e motivos em frases-modelo ("Parecido com Dark, que você amou").

> Os limites do plano grátis mudam de tempos em tempos; confira os valores atuais no painel de cada serviço.
> O app guarda os resultados da IA em cache para gastar pouco.
> No plano grátis do Gemini, o Google pode usar o conteúdo enviado para melhorar os modelos. O app só envia
> seu perfil de gosto e dados públicos de filmes.

### 🔐 Supabase (obrigatório: login e banco de dados)
1. Crie uma conta em [supabase.com](https://supabase.com) e clique em **New project**.
   Escolha um nome, crie uma senha do banco (guarde-a) e a região **South America (São Paulo)**.
2. Espere o projeto ficar pronto (1 a 2 minutos).
3. Vá em **Project Settings** → **API Keys** (e **Data API** para a URL). Você vai precisar de três valores:
   - **Project URL** (ex.: `https://abcdxyz.supabase.co`)
   - **anon / publishable key** (pública)
   - **service_role / secret key** (secreta, dá acesso total: **só** no `server/.env`!)
4. Preencha:
   - `.env` (raiz): `VITE_SUPABASE_URL=` (Project URL) e `VITE_SUPABASE_ANON_KEY=` (anon/publishable)
   - `server/.env`: `SUPABASE_URL=` (Project URL), `SUPABASE_ANON_KEY=` (anon/publishable) e
     `SUPABASE_SERVICE_ROLE_KEY=` (service_role/secret)
5. Em **Authentication** → **URL Configuration**:
   - **Site URL**: `http://localhost:5173`
   - **Redirect URLs**: adicione `http://localhost:5173/**`

> **Confirmação de email:** por padrão o Supabase pede que o email seja confirmado antes do primeiro login.
> Para uso pessoal, você pode desligar em **Authentication** → **Sign In / Providers** → **Email** →
> desmarque **Confirm email**.

---

## Criar as tabelas no Supabase

1. No painel do Supabase, abra **SQL Editor** → **New query**.
2. Abra o arquivo [`supabase/schema.sql`](supabase/schema.sql) deste projeto, copie **tudo** e cole lá.
3. Clique em **Run**. Deve aparecer "Success. No rows returned".

Pronto: as tabelas são criadas com **Row Level Security** (cada usuário só vê os próprios dados).
Pode rodar o script de novo sem problema, se precisar.

| Tabela | O que guarda |
|---|---|
| `profiles` | nome do usuário e os últimos filtros de pesquisa |
| `taste_profiles` | o perfil de gosto gerado (IA ou regras) |
| `quiz_answers` | respostas do quiz (o quiz continua de onde parou) |
| `watch_history_import` | histórico da Netflix importado, já agrupado por série |
| `user_titles` | Já vi (com nota) / Quero ver / Não me interessa |
| `availability_cache` | verificação "está na Netflix BR?" (refeita a cada 24h) |
| `recommendation_cache` | último catálogo "Para você" |
| `api_cache` | respostas do TMDB, OMDb e IA (economiza limites) |

---

## Ativar o login com Google (opcional)

O login por email e senha funciona sem isso. Para o botão **Entrar com Google**:

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto (ou use um existente).
2. Vá em **APIs e serviços** → **Tela de consentimento OAuth**: tipo **Externo**, preencha nome do app e seu email.
   Em "Usuários de teste", adicione o seu email.
3. Vá em **Credenciais** → **Criar credenciais** → **ID do cliente OAuth** → tipo **Aplicativo da Web**.
4. Em **URIs de redirecionamento autorizados**, cole a URL de callback que aparece no Supabase em
   **Authentication** → **Sign In / Providers** → **Google** (algo como `https://abcdxyz.supabase.co/auth/v1/callback`).
5. Copie o **Client ID** e o **Client Secret** do Google, cole nessa mesma tela do Supabase e ative o provedor Google.

---

## Como testar

Com tudo configurado e `npm run dev` rodando, abra http://localhost:5173:

1. **Login:** crie uma conta (ou entre com Google). Sem perfil, você cai na tela com os 3 caminhos.
2. **Quiz:** responda as 10 perguntas. Feche o navegador no meio e volte: ele continua de onde parou.
   No fim, a tela "Montando seu perfil…" leva ao painel.
3. **Histórico:** siga o tutorial, baixe o `NetflixViewingHistory.csv` e arraste para a área de upload.
   Veja a barra "Identificando N títulos…", corrija os não identificados e avalie os 20 principais.
4. **Combinado:** histórico → avaliação rápida → quiz. Na pergunta 10 aparecem os títulos marcados com ❤️.
5. **Para você:** pelo menos 10 cards, todos com o selo "✅ Na Netflix Brasil · verificado em DD/MM".
   Teste o humor do dia, o trailer, "O que o público diz" e os botões ✅ Já vi / 🔖 Quero ver / 🚫 Não me interessa.
   A cada 5 avaliações, o perfil se atualiza sozinho.
6. **Pesquisar:** combine filtros ou escreva "algo tipo Dark, mas menos confuso".
7. **Meu gosto:** resumo do perfil, gráficos e botões para refazer o quiz ou reimportar o histórico.
8. **Sem IA:** troque `AI_PROVIDER=none` no `server/.env`, reinicie e veja que tudo continua funcionando.

---

## Imagens do tutorial do histórico

A tela do tutorial tem um espaço para imagem/GIF em cada passo. Enquanto as imagens não existem,
aparece um espaço reservado. Para colocar as reais, salve os arquivos com estes nomes:

```
public/tutorial/passo-1.gif   (página netflix.com/viewingactivity aberta)
public/tutorial/passo-2.gif   (escolhendo o perfil)
public/tutorial/passo-3.gif   (rolando até o fim da lista)
public/tutorial/passo-4.gif   (clicando em "Baixar tudo")
```
Pode ser `.gif`, mas o nome precisa ser exatamente esse. Para usar `.png`, troque a extensão em
`src/modules/cinematch/pages/Historico.jsx` (lista `PASSOS`).

---

## Como o app funciona

### Verificação "está na Netflix Brasil?"
**Nada aparece no catálogo sem estar verificado.** A busca no TMDB já vem filtrada por Netflix + Brasil +
assinatura (provedores 8 = Netflix e 1796 = Netflix com anúncios). Depois, **cada título** é conferido
individualmente nos provedores de streaming do TMDB, e só entra se a Netflix aparecer. A verificação vale por 24h.

Os dados de disponibilidade vêm do **JustWatch** (via TMDB). Eles podem atrasar um ou dois dias quando
um título entra ou sai da Netflix. A Netflix não tem API pública, e esta é a fonte mais confiável disponível.

### Leitura do histórico: nenhuma adivinhação
Um título do histórico só é ligado a um filme ou série quando o **nome é idêntico** ao do TMDB (em português,
no idioma original ou num nome oficial alternativo, sem contar acentos e pontuação).
- Linhas sem nome, como `" : Episódio 3"` (é assim que a Netflix exporta títulos que saíram do catálogo), são descartadas.
- Se existir mais de um título com o mesmo nome (ex.: "Roma" de 1972 e de 2018), o app **não escolhe**: mostra as opções
  na revisão e você decide. Para separar homônimos, só usa fatos: país ou ano escritos no nome ("The Office (U.S.)"),
  a data em que você assistiu (ninguém assiste antes do lançamento) e o tipo (vários episódios = série).
- O que ficar pendente não entra no seu perfil.
- Cada importação **substitui** a anterior (o arquivo da Netflix sempre traz o histórico completo). Notas e avaliações
  feitas no app nunca são apagadas.

### Como o CineMatch escolhe o que recomendar

**1. Assinatura de gosto** (`server/services/tasteSignature.js`). Gênero é amplo demais: "drama" serve para
quase tudo. Por isso o app olha os **detalhes** de até 60 títulos que dizem algo sobre você:
- temas (palavras-chave do TMDB, como "viagem no tempo", "cidade pequena" ou "narrativa não linear")
- diretores, criadores e atores principais
- idioma original e década

Os títulos que você amou somam pontos, e os que você rejeitou ou largou no começo tiram.
O peso de cada um depende da fonte: citado no quiz > nota dada no app > o quanto você assistiu.
Cada candidato é comparado com essa assinatura (similaridade de cosseno).

**2. Candidatos de 3 fontes:**
- **Sementes:** recomendações do TMDB a partir de até 10 favoritos seus e, para filmes, os vizinhos minerados
  do **MovieLens** (veja [Mineração de dados](#mineração-de-dados-movielens)). Um título que aparece a partir de
  **vários** favoritos ganha pontos extras (consenso).
- **Conhecimento da IA:** ela sugere títulos pelo nome, como um curador faria. O servidor procura cada um
  no TMDB, exige que **nome e ano batam** e verifica na Netflix. O que não bater é descartado.
- **Descoberta:** busca no catálogo da Netflix BR pelos seus gêneros, idiomas e palavras-chave.
- **Séries:** o catálogo **inteiro** de séries da Netflix BR (~3.500), avaliado pelo componente de séries (abaixo).

**3. Pontuação**, sempre calculada, com ou sem IA: assinatura de gosto + consenso + **filtragem colaborativa**
(MovieLens: "quem amou os mesmos filmes que você também amou este") + **componente de séries** + gêneros e
idiomas + **nota bayesiana**. A nota bayesiana é a mesma ideia do ranking do IMDb: um 9,0 com 12 votos vale menos
que um 8,2 com 20 mil votos.

**Componente de séries** (`server/services/seriesService.js`, só para séries). Usa **todas** as suas séries, sem
nenhum limite, cada uma com o seu peso (nota no app > "Não me interessa" > o quanto você assistiu; as que você
largou no começo contam contra). Para cada série do catálogo, soma dois sinais:
- **Conteúdo (TMDB):** o quanto ela se parece com cada série sua em sinopse, temas, gêneros, criadores, elenco e
  origem (TF-IDF: temas raros valem mais que os comuns). As séries mais parecidas mandam no sinal.
- **Trakt:** se ela está na lista de "relacionadas" de séries suas (e em que posição). Precisa do `TRAKT_CLIENT_ID`.

Os dois viram pontos de −1,5 a +3, centrados na média do catálogo (a série média ganha 0). O "🔍 Rastreamento da
nota" mostra quanto cada um somou e de quais séries suas veio o sinal. As fichas das séries ficam guardadas por
30 dias e as listas do Trakt também; quem importa o histórico já tem tudo preparado em segundo plano.
Para os filmes não sumirem da lista (agora há milhares de séries candidatas), as 20 finais têm pelo menos 30% de
filmes e 30% de séries, quando houver dos dois (menos no humor "maratona").
Avaliação com os seus dados: `npm run avaliar:series -- --email=voce@exemplo.com`.

**4. Variedade (MMR):** evita 10 cards quase iguais, por exemplo todos derivados do mesmo favorito.

**5. Curadoria da IA:** recebe os 30 melhores com os sinais calculados, escolhe os 15 que mais combinam,
dá a **% de compatibilidade** e escreve o motivo. Sem IA, a % e o motivo vêm das regras.

A página **Meu gosto** mostra o seu "DNA de cinema": os temas, diretores e atores que mais se repetem nos seus favoritos.
Ela também mostra o que a mineração encontrou: regras "quem amou A também amou B" e suas famílias de gosto.

### A IA
Roda **só no servidor** (`server/services/aiService.js`) e sempre responde em JSON, que é validado.
Ela **nunca inventa** o que aparece na tela: as sugestões dela só entram depois de encontradas no TMDB e
verificadas na Netflix, e IDs que não estavam na lista de candidatos são descartados. Funções:
- **Perfil de gosto:** junta quiz + histórico + avaliações + assinatura e percebe nuances
  ("rejeita romance clichê, mas consome romance europeu").
- **Sugestões por conhecimento** de cinema (verificadas depois).
- **Ranking com % de compatibilidade e motivo** ("Por que pra você").
- **Tradução dos temas** do TMDB (que vêm em inglês) para português.
- **Resumo das resenhas reais** do TMDB (com link para as originais).
- **Busca em texto livre:** "comédia leve para ver com minha mãe" vira filtros.

Se a IA falhar ou estiver desligada, tudo continua funcionando com regras.

> **Dica para recomendações mais precisas:** quanto mais você avalia (estrelas no "Já vi", ❤️ na avaliação
> rápida, motivo no "Não me interessa"), mais detalhada fica a assinatura. A cada 5 avaliações o perfil
> se recalcula sozinho, e você também pode clicar em **🔄 Recalcular** na página Meu gosto.

### Testes automáticos
```bash
npm test
```
Roda todos os testes sem internet e sem chaves, com TMDB e IA simulados:
- leitura do CSV;
- regras de pontuação;
- verificação da Netflix (nada fora dela aparece);
- exclusão de títulos já vistos ou descartados;
- validação de tudo o que a IA devolve;
- as 5 etapas da mineração de dados, com uma base sintética pequena.

### Gêneros de filmes x séries
O TMDB usa listas de gêneros diferentes para filmes e séries (séries nem têm "Romance" ou "Terror").
Por isso o CineMatch usa gêneros próprios (`server/lib/genres.js`) que se traduzem para os dois.

### Estrutura de pastas

```
/
├─ src/
│  ├─ modules/
│  │  ├─ index.js                ← lista de módulos do hub
│  │  └─ cinematch/              ← tudo do CineMatch (rotas sob /cinematch)
│  │     ├─ pages/               telas (Login, Escolha, Quiz, Historico, Combinado…)
│  │     │  └─ dashboard/        abas do painel (Para você, Pesquisar, listas, Meu gosto)
│  │     ├─ components/          MovieCard, FilterForm, Dropzone, QuizQuestion, RatingStars…
│  │     ├─ data/quizQuestions.js  as 10 perguntas (o servidor também lê este arquivo)
│  │     ├─ lib/                 parseNetflixCsv.js, api.js, profile.js…
│  │     └─ routes.jsx           rotas do módulo
│  ├─ shared/                    layout, login (auth), modal, toast, estados de erro/vazio
│  ├─ App.jsx                    monta as rotas de todos os módulos
│  └─ main.jsx                   ponto de entrada do React
├─ server/                       backend Node.js + Express (guarda as chaves)
│  ├─ routes/                    endpoints /api/...
│  ├─ services/                  tmdb, omdb, IA, netflixCheck, perfil, assinatura de gosto,
│  │                             pontuação, recomendações, pesquisa, cache
│  ├─ lib/                       config, auth, gêneros, idiomas, texto, limitador de requisições
│  └─ index.js
│  └─ data/movielens.json.gz     resultado da mineração (gerado por npm run mineracao)
├─ scripts/mineracao/            as 5 etapas do KDD sobre o MovieLens
├─ dados/movielens/              bases brutas baixadas (fora do Git)
├─ docs/mineracao/relatorio.md   relatório gerado pela mineração
├─ tests/                        testes automáticos (npm test)
├─ supabase/schema.sql           tabelas do banco
└─ README.md
```

### Endpoints do backend
Todos (menos `health` e `genres`) exigem login: o navegador envia o token do Supabase.

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/health` | status do servidor e das chaves |
| GET | `/api/tmdb/search?q=` | autocompletar de títulos |
| GET | `/api/tmdb/genres` | gêneros e idiomas para os filtros |
| POST | `/api/import/netflix-csv` | identifica títulos do histórico no TMDB (em lotes) |
| POST | `/api/import/save` | salva o histórico e marca tudo como "Já vi" |
| GET/POST | `/api/profile` · `/api/profile/generate` | lê / gera o perfil de gosto |
| GET | `/api/recommendations?humor=&tempo=&forcar=1` | catálogo "Para você" |
| POST | `/api/search` | pesquisa com filtros + texto livre |
| GET | `/api/title/:tipo/:id` · `/reviews` | detalhes completos / resumo das resenhas |
| GET/POST/DELETE | `/api/user-titles` | Já vi / Quero ver / Não me interessa |

### Adicionando um novo projeto ao hub (futuro)
1. Crie `src/modules/<nome>/routes.jsx` seguindo o modelo do CineMatch.
2. Registre o módulo em `src/modules/index.js`.

### Pensando no app de desktop (Electron)
`npm start` compila o site em `dist/` e sobe o servidor em modo produção: ele mesmo entrega o site e a API
no mesmo endereço (http://localhost:3001). No futuro, o Electron só precisa iniciar o servidor e abrir essa
página numa janela.

---

## Mineração de dados (MovieLens)

O CineMatch tem um único usuário, então sozinho ele não consegue descobrir "quem gosta do que você gosta".
Para isso ele usa a base pública **MovieLens 32M** (32 milhões de notas de cerca de 200 mil pessoas) e aplica as
5 etapas do processo **KDD** (descoberta de conhecimento em bases de dados):

| Etapa | O que faz |
|---|---|
| 1. Seleção | Liga cada filme do MovieLens ao ID do TMDB (o mesmo que o app usa) |
| 2. Pré-processamento | Remove filmes com menos de 500 notas e pessoas com menos de 20 |
| 3. Transformação | Cada pessoa vira a lista de filmes que ela **gostou** (nota ≥ 4 e acima da média dela); 2% ficam de fora para avaliação |
| 4. Mineração | Coocorrência, **similaridade item-item** misturada ao **conteúdo** (TMDB + tags), **EASE** para quem tem 20+ filmes, **regras de associação** e **k-means** |
| 5. Interpretação | Mede a qualidade (HitRate@10), gera o arquivo do app e o [relatório](docs/mineracao/relatorio.md) |

O resultado já está pronto em `server/data/movielens.json.gz` (6 MB). **Você não precisa rodar nada para usar.**
Para refazer (por exemplo, depois de mudar um parâmetro em `scripts/mineracao/config.js`):

```bash
npm run mineracao:baixar   # baixa a base (~240 MB) para dados/movielens/ (só na primeira vez)
npm run mineracao          # roda as 5 etapas (~1 minuto num computador comum)
npm run mineracao:teste    # versão rápida com a base pequena (~1 MB), só para testar o processo
npm run mineracao:conteudo # baixa o conteúdo: metadados do TMDB e Tag Genome (~260 MB), uma vez
npm run mineracao:experimentos   # testa cada melhoria (validação → teste); ~15 min (o EASE fica em cache)
npm run avaliar:usuario -- --usuario=<início do id>   # avalia o sistema completo com os seus dados
npm run avaliar:comparar   # 10 recomendações antigas × 10 novas, com rastreamento
```
Depois reinicie o `npm run dev`. Para rodar uma etapa só: `npm run mineracao -- --etapa=4`.

**Resultado da avaliação** (pessoas que não entraram na mineração): o modelo acerta um filme que a pessoa gostou
entre as 10 primeiras sugestões em **80,3%** dos casos (NDCG@10 0,372), contra **53,5%** de quem só sugere os
filmes mais populares. O modelo original acertava 75,1% (NDCG@10 0,296).

**No app**, o MovieLens usa **todos** os seus filmes que existem na base, cada um com um peso
(nota, "Não me interessa", quantas vezes viu e há quanto tempo). Com menos de 20, o peso dele cai e aparece um aviso.
Cada recomendação tem um **rastreamento** ("🔍 Rastreamento da nota", nos detalhes do título) com quanto cada parte
somou e quais filmes seus geraram o sinal. Protocolo, critérios e resultados: [docs/avaliacao/](docs/avaliacao/RESULTADOS.md).

A explicação completa de cada etapa está em [scripts/mineracao/README.md](scripts/mineracao/README.md).
Licença e citação: [server/data/LEIA-ME.md](server/data/LEIA-ME.md).

---

## Problemas comuns

| Sintoma | Solução |
|---|---|
| "Não foi possível falar com o servidor" | O `npm run dev` está rodando? Rode só **um** terminal com ele. |
| Site abriu na porta 5174 | Já existe outro `npm run dev` aberto. Feche os terminais extras. |
| "Tabelas do banco não encontradas" | Rode o `supabase/schema.sql` no SQL Editor do Supabase. |
| "Token do TMDB inválido" | Use o **Token de Leitura** (longo, `eyJ...`), não a chave curta. |
| Login diz "Confirme seu email" | Clique no link do email, ou desligue "Confirm email" no Supabase. |
| Notas do IMDb não aparecem | Falta a `OMDB_API_KEY` ou ela não foi ativada pelo link do email. |
| Motivos simples, sem ✨ | A IA está sem chave, desligada ou atingiu o limite do dia. |
| "MovieLens não minerado ainda" | Falta o `server/data/movielens.json.gz`. Rode `npm run mineracao:baixar` e `npm run mineracao`. |

---

## Atribuições
Dados de filmes: [TMDB](https://www.themoviedb.org). Disponibilidade em streaming: [JustWatch](https://www.justwatch.com/br).
Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.

Filtragem colaborativa: dados do [MovieLens](https://grouplens.org/datasets/movielens/) (GroupLens Research, University of Minnesota),
usados para fins não comerciais. O CineMatch não é endossado pelo GroupLens.
F. Maxwell Harper and Joseph A. Konstan. 2015. The MovieLens Datasets: History and Context.
ACM Transactions on Interactive Intelligent Systems (TiiS) 5, 4: 19:1–19:19. https://doi.org/10.1145/2827872
