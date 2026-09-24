const router = require('express').Router();
const { languageName } = require('../workspace');

const { getStore, SANDBOX } = require('../db');
const { stubVerdict }    = require('../sandbox-validator');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

router.post('/', async (req, res) => {
  const {
    concept_id,
    section_summary,
    user_answer,
    valid_concept_ids = [],
    is_teachback = false,
    lesson_id
  } = req.body;

  if (!user_answer?.trim()) {
    return res.status(400).json({ error: 'user_answer is required' });
  }

  const conceptList = valid_concept_ids.length
    ? valid_concept_ids.join(', ')
    : concept_id;

  const LANGUAGE = languageName();

  const prompt = `You are a learning validator for a system design course.
The student is learning: ${concept_id}.

Lesson context:
${section_summary || 'No additional context provided.'}

Canonical concept vocabulary — use ONLY these exact IDs in concepts_demonstrated:
${conceptList}

Student's explanation:
${user_answer}

Score 0–100:
- 0–40:  concept not understood
- 41–74: partial understanding, important gaps
- 75–89: solid understanding, minor inaccuracies
- 90–100: clear mastery

Write every human-readable string — feedback and misconceptions — in ${LANGUAGE}, whatever language the student wrote in. This is the language of their workspace, not a guess.

Return JSON only (no markdown wrapper, no explanation outside the JSON):
{
  "score": <number>,
  "feedback": "<2-3 sentences, written in ${LANGUAGE}>",
  "concepts_demonstrated": ["<IDs from canonical vocabulary only>"],
  "misconceptions": ["<brief description of each misconception found, or empty array>"]
}`;

  try {
    let parsed;

    if (SANDBOX) {
      // Deterministic, so a layout regression is never mistaken for the model's mood.
      parsed = stubVerdict({ user_answer, concept_id, valid_concept_ids, is_teachback });
    } else {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({
          error: 'GEMINI_API_KEY is not set — copy .env.example to .env at the repo root and fill it in',
          setup: true
        });
      }

      const geminiRes = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      if (!geminiRes.ok) {
        const detail = await geminiRes.text();
        console.error('Gemini error:', geminiRes.status, detail);

        // A rejected key is a setup problem, not an outage.
        const badKey = geminiRes.status === 400 && /API key not valid/i.test(detail);
        return res.status(badKey ? 503 : 502).json({
          error: badKey
            ? 'Gemini rejected the API key — check GEMINI_API_KEY in .env at the repo root'
            : `Gemini API error (${geminiRes.status})`,
          setup: badKey
        });
      }

      const data  = await geminiRes.json();
      const raw   = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!raw) {
        return res.status(502).json({ error: 'Empty response from Gemini' });
      }

      parsed = JSON.parse(raw);
    }

    // The model sometimes invents IDs outside the canonical vocabulary.
    if (valid_concept_ids.length && Array.isArray(parsed.concepts_demonstrated)) {
      parsed.concepts_demonstrated = parsed.concepts_demonstrated.filter(id =>
        valid_concept_ids.includes(id)
      );
    }

    // A failed write must not cost the student the verdict they are waiting for.
    if (lesson_id) {
      try {
        getStore().insertSection({
          lesson_id,
          concept_id,
          is_teachback,
          score:                 parsed.score,
          feedback:              parsed.feedback,
          concepts_demonstrated: parsed.concepts_demonstrated,
          misconceptions:        parsed.misconceptions
        });
      } catch (err) {
        console.error('section_results save error:', err);
      }
    }

    res.json(parsed);

  } catch (err) {
    console.error('validate error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
