// As 10 perguntas do quiz do CineMatch.
//
// Este arquivo é JavaScript puro (sem React), para que o servidor também possa importá-lo.
//
// Cada opção tem:
//   id      -> identificador salvo no banco
//   texto   -> o que o usuário vê
//   signals -> o que a resposta significa para o motor de recomendação:
//      generos:       { chave: peso }  de -1 (evitar) a +1 (adora). Chaves em server/lib/genres.js
//      idiomas:       códigos de idioma original preferidos (ISO 639-1)
//      palavras_chave: termos em inglês para buscar keywords no TMDB
//      tom:           tags de tom/estilo que a pessoa curte (a IA interpreta)
//      evitar:        coisas que a pessoa quer evitar
//      formato:       preferência de duração/compromisso
//      nuance:        frase explicando a sutileza da resposta (para a IA)

export const QUIZ_QUESTIONS = [
  {
    id: 1,
    pergunta: 'Como você se sente sobre romance?',
    multipla: false,
    opcoes: [
      {
        id: 'fujo',
        texto: 'Fujo de romance, prefiro qualquer outra coisa',
        signals: { generos: { romance: -1 }, evitar: ['romance como tema central'] },
      },
      {
        id: 'cliche_mas_europeu',
        texto: 'Acho clichê, mas romance europeu, independente ou mais realista eu gosto',
        signals: {
          generos: { romance: 0.2, drama: 0.2 },
          idiomas: ['fr', 'es', 'it', 'de'],
          tom: ['realista', 'independente'],
          evitar: ['romance clichê', 'comédia romântica água com açúcar'],
          nuance: 'Rejeita romance clichê/hollywoodiano, mas gosta de romance europeu, indie ou realista.',
        },
      },
      {
        id: 'pano_de_fundo',
        texto: 'Gosto quando é pano de fundo, não o centro da história',
        signals: { generos: { romance: -0.2 }, nuance: 'Aceita romance como subtrama, não como foco.' },
      },
      {
        id: 'com_drama',
        texto: 'Gosto de romance com drama ou alguma tensão, nada água com açúcar',
        signals: {
          generos: { romance: 0.5, drama: 0.5 },
          tom: ['tensão emocional'],
          evitar: ['romance água com açúcar'],
        },
      },
      {
        id: 'amo',
        texto: 'Amo, quanto mais romântico melhor',
        signals: { generos: { romance: 1 }, tom: ['romântico'] },
      },
    ],
  },
  {
    id: 2,
    pergunta: 'E sobre medo e tensão?',
    multipla: false,
    opcoes: [
      {
        id: 'nada_tenso',
        texto: 'Nada que me deixe tenso, quero relaxar',
        signals: { generos: { terror: -1, thriller: -0.6 }, tom: ['relaxante'], evitar: ['tensão', 'terror'] },
      },
      {
        id: 'suspense_psicologico',
        texto: 'Terror não, mas suspense psicológico me prende',
        signals: {
          generos: { terror: -0.7, thriller: 0.8, misterio: 0.5 },
          palavras_chave: ['psychological thriller'],
          tom: ['suspense psicológico'],
          evitar: ['terror sobrenatural'],
        },
      },
      {
        id: 'terror_com_historia',
        texto: 'Gosto de terror com boa história, não de susto barato',
        signals: {
          generos: { terror: 0.6, thriller: 0.4 },
          tom: ['terror elevado', 'atmosférico'],
          evitar: ['susto barato', 'jumpscare'],
        },
      },
      {
        id: 'quanto_mais_assustador',
        texto: 'Quanto mais assustador, melhor',
        signals: { generos: { terror: 1, thriller: 0.5 }, tom: ['assustador'] },
      },
    ],
  },
  {
    id: 3,
    pergunta: 'Qual final te deixa mais satisfeito?',
    multipla: false,
    opcoes: [
      { id: 'resolvido', texto: 'Tudo explicado e resolvido', signals: { tom: ['final fechado'], evitar: ['final ambíguo'] } },
      {
        id: 'aberto',
        texto: 'Final aberto, que me deixa pensando por dias',
        signals: { generos: { drama: 0.2, misterio: 0.2 }, tom: ['final aberto', 'reflexivo'] },
      },
      {
        id: 'reviravolta',
        texto: 'Reviravolta que eu não vi chegando, mas que faz sentido',
        signals: {
          generos: { misterio: 0.5, thriller: 0.4 },
          palavras_chave: ['plot twist'],
          tom: ['reviravolta bem amarrada'],
        },
      },
      { id: 'jornada', texto: 'Tanto faz, se a jornada for boa', signals: { tom: ['foco na jornada'] } },
    ],
  },
  {
    id: 4,
    pergunta: 'Que ritmo combina com você?',
    multipla: false,
    opcoes: [
      {
        id: 'contemplativo',
        texto: 'Lento e contemplativo, gosto de saborear',
        signals: { generos: { drama: 0.3 }, tom: ['contemplativo', 'ritmo lento'] },
      },
      {
        id: 'lento_se_incrivel',
        texto: 'Lento só se a atuação ou a fotografia forem incríveis',
        signals: {
          tom: ['atuações fortes', 'fotografia marcante'],
          nuance: 'Tolera ritmo lento apenas em obras muito bem atuadas ou filmadas (aclamadas pela crítica).',
        },
      },
      { id: 'equilibrado', texto: 'Equilibrado, com respiros', signals: { tom: ['ritmo equilibrado'] } },
      {
        id: 'acelerado',
        texto: 'Acelerado do início ao fim',
        signals: { generos: { acao: 0.6, thriller: 0.4 }, tom: ['acelerado'], evitar: ['ritmo lento'] },
      },
    ],
  },
  {
    id: 5,
    pergunta: 'Que tipo de humor te ganha?',
    multipla: true,
    opcoes: [
      {
        id: 'acido',
        texto: 'Ácido, sarcástico ou britânico',
        signals: { generos: { comedia: 0.4 }, palavras_chave: ['dark comedy'], tom: ['humor ácido', 'humor britânico'] },
      },
      { id: 'besteirol', texto: 'Besteirol, rir sem pensar', signals: { generos: { comedia: 0.8 }, tom: ['besteirol'] } },
      {
        id: 'dramedia',
        texto: 'Humor no meio do drama, leve e humano',
        signals: { generos: { comedia: 0.3, drama: 0.4 }, tom: ['dramédia', 'humano'] },
      },
      {
        id: 'absurdo',
        texto: 'Humor absurdo ou nonsense',
        signals: { generos: { comedia: 0.5 }, tom: ['humor absurdo', 'nonsense'] },
      },
      { id: 'nao_ligo', texto: 'Não ligo muito para comédia', signals: { generos: { comedia: -0.4 } } },
    ],
  },
  {
    id: 6,
    pergunta: 'Origem e idioma',
    multipla: true,
    opcoes: [
      {
        id: 'qualquer_pais',
        texto: 'Legenda não me incomoda, gosto de qualquer país',
        signals: { tom: ['aberto a produções internacionais'] },
      },
      { id: 'asiaticas', texto: 'Curto produções coreanas e asiáticas', signals: { idiomas: ['ko', 'ja', 'zh', 'th'] } },
      { id: 'latinas', texto: 'Curto produções espanholas e latinas', signals: { idiomas: ['es'] } },
      {
        id: 'europeias',
        texto: 'Curto produções europeias (França, Alemanha, países nórdicos…)',
        signals: { idiomas: ['fr', 'de', 'it', 'sv', 'da', 'no', 'nl', 'pl'] },
      },
      { id: 'brasileiras', texto: 'Gosto de produções brasileiras', signals: { idiomas: ['pt'] } },
      {
        id: 'americanas',
        texto: 'Prefiro produções americanas ou britânicas',
        signals: { idiomas: ['en'], evitar: ['legendas'] },
      },
    ],
  },
  {
    id: 7,
    pergunta: 'Quanto peso emocional você aguenta?',
    multipla: false,
    opcoes: [
      {
        id: 'leve',
        texto: 'Quero algo leve, que me faça bem',
        signals: {
          generos: { comedia: 0.4, familia: 0.3, drama: -0.3, guerra: -0.6 },
          tom: ['leve', 'feel good'],
          evitar: ['temas pesados', 'violência'],
        },
      },
      {
        id: 'chorar',
        texto: 'Gosto de chorar com um bom drama',
        signals: { generos: { drama: 0.8, romance: 0.2 }, tom: ['emocionante'] },
      },
      {
        id: 'pesado_sem_violencia',
        texto: 'Pesado tudo bem, mas violência gráfica não',
        signals: { generos: { drama: 0.5 }, tom: ['denso'], evitar: ['violência gráfica'] },
      },
      {
        id: 'pesado_violento',
        texto: 'Pode ser pesado e violento, se tiver propósito',
        signals: { generos: { crime: 0.5, thriller: 0.4, guerra: 0.3 }, tom: ['intenso', 'violência com propósito'] },
      },
    ],
  },
  {
    id: 8,
    pergunta: 'Realidade ou imaginação?',
    multipla: true,
    opcoes: [
      {
        id: 'fatos_reais',
        texto: 'Histórias baseadas em fatos reais e documentários',
        signals: {
          generos: { documentario: 0.7, historia: 0.5 },
          palavras_chave: ['based on true story'],
          tom: ['baseado em fatos reais'],
        },
      },
      {
        id: 'scifi_cerebral',
        texto: 'Ficção científica cerebral, que me faz pensar',
        signals: {
          generos: { scifi: 1, misterio: 0.3 },
          palavras_chave: ['time travel', 'dystopia'],
          tom: ['cerebral'],
        },
      },
      {
        id: 'fantasia_epica',
        texto: 'Fantasia épica, mundos inteiros',
        signals: { generos: { fantasia: 1, aventura: 0.5 }, palavras_chave: ['epic'], tom: ['épico'] },
      },
      {
        id: 'toque_estranho',
        texto: 'Mundo real com um toque estranho (estilo Black Mirror)',
        signals: {
          generos: { scifi: 0.5, misterio: 0.5, thriller: 0.3 },
          palavras_chave: ['dystopia'],
          tom: ['estranho', 'distopia próxima'],
        },
      },
      {
        id: 'drama_realista',
        texto: 'Drama realista do dia a dia',
        signals: { generos: { drama: 0.6 }, tom: ['realista', 'cotidiano'] },
      },
    ],
  },
  {
    id: 9,
    pergunta: 'Quanto compromisso você quer?',
    multipla: false,
    opcoes: [
      { id: 'filmes_2h', texto: 'Só filmes, de até 2 horas', signals: { formato: 'filmes_curtos' } },
      { id: 'minisseries', texto: 'Filmes ou minisséries fechadas', signals: { formato: 'filmes_ou_minisseries' } },
      { id: 'series_longas', texto: 'Séries longas sem problema, se forem boas', signals: { formato: 'qualquer' } },
      { id: 'depende', texto: 'Depende do dia (o app pergunta na hora)', signals: { formato: 'depende' } },
    ],
  },
  {
    id: 10,
    pergunta: 'Cite 1 a 3 filmes ou séries que você amou e diga o porquê.',
    tipo: 'titulos',
    multipla: true,
    maxTitulos: 3,
    ajuda: 'Esta é a resposta mais valiosa: os títulos viram a "âncora" do seu perfil.',
    opcoes: [],
  },
];

export const TOTAL_PERGUNTAS = QUIZ_QUESTIONS.length;

export function perguntaPorId(id) {
  return QUIZ_QUESTIONS.find((q) => q.id === Number(id));
}
