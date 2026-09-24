const BANDS = {
  '!0':  { score: 22, feedback: 'Sandbox: resposta marcada como NÃO COMPREENDIDA. O conceito central não aparece na explicação.', misconceptions: ['Sandbox: confunde o conceito com um caso particular.'] },
  '!p':  { score: 61, feedback: 'Sandbox: resposta marcada como PARCIAL. A ideia geral está lá, mas faltam os trade-offs.', misconceptions: ['Sandbox: não menciona o custo da abordagem.'] },
  '!ok': { score: 82, feedback: 'Sandbox: resposta marcada como SÓLIDA. Explicação correta, com imprecisões menores.', misconceptions: [] },
  '!m':  { score: 95, feedback: 'Sandbox: resposta marcada como DOMÍNIO. Explicação clara, com trade-offs e um exemplo concreto.', misconceptions: [] }
};

function bandFromLength(text) {
  const n = text.trim().length;
  if (n < 40)  return BANDS['!0'];
  if (n < 120) return BANDS['!p'];
  if (n < 320) return BANDS['!ok'];
  return BANDS['!m'];
}

function stubVerdict({ user_answer = '', concept_id, valid_concept_ids = [], is_teachback = false }) {
  const trimmed = user_answer.trim();

  // Longest token first, so "!ok" is not shadowed by a shorter prefix.
  const token = Object.keys(BANDS)
    .sort((a, b) => b.length - a.length)
    .find(t => trimmed.toLowerCase().startsWith(t));

  const band = token ? BANDS[token] : bandFromLength(trimmed);

  // Mirrors the real route: only canonical IDs, and a failing answer demonstrates nothing.
  const vocabulary = valid_concept_ids.length ? valid_concept_ids : [concept_id].filter(Boolean);
  const demonstrated = band.score >= 75 ? vocabulary : [];

  return {
    score:                 band.score,
    feedback:              is_teachback ? `${band.feedback} (teach-back)` : band.feedback,
    concepts_demonstrated: demonstrated,
    misconceptions:        [...band.misconceptions]
  };
}

module.exports = { stubVerdict, BANDS };
