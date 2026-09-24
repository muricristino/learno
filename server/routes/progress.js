const router = require('express').Router();

const { getDb } = require('../db');
const { languageLocale } = require('../workspace');

// Passing a project is stronger evidence than a lesson at the same score, so the
// interval goes further. Failing says less — see the POST loop.
const PROJECT_BOOST = 1.5;

function sm2(score, current, { project = false } = {}) {
  let interval_days = current?.interval_days ?? 1;
  let ease_factor   = current?.ease_factor   ?? 2.5;
  const boost = project ? PROJECT_BOOST : 1;

  if (score >= 90) {
    interval_days = Math.round(interval_days * ease_factor * boost);
    ease_factor   = Math.min(ease_factor + (project ? 0.15 : 0.1), 4.0);
  } else if (score >= 75) {
    interval_days = Math.round(interval_days * ease_factor * boost);
  } else if (score >= 41) {
    interval_days = 1;
    ease_factor   = Math.max(ease_factor - 0.15, 1.3);
  } else {
    interval_days = 0;
    ease_factor   = Math.max(ease_factor - 0.2, 1.3);
  }

  const next_review = new Date();
  next_review.setDate(next_review.getDate() + interval_days);

  return { interval_days, ease_factor, next_review };
}

router.post('/', async (req, res) => {
  const {
    lesson_id,
    final_score,
    concepts_demonstrated = [],
    concepts_missed = [],
    sections = [],
    kind = 'lesson'
  } = req.body;

  if (!lesson_id || final_score === undefined) {
    return res.status(400).json({ error: 'lesson_id and final_score are required' });
  }

  const isProject = kind === 'project';
  const missed    = new Set(concepts_missed);

  try {
    const db = await getDb();

    const savedSections = await db.collection('section_results')
      .find({ lesson_id })
      .sort({ recorded_at: 1 })
      .toArray();

    const allSections = savedSections.length ? savedSections : sections;

    await db.collection('lessons').updateOne(
      { lesson_id },
      {
        $set: {
          lesson_id,
          kind,
          completed_at: new Date(),
          final_score,
          sections: allSections
        }
      },
      { upsert: true }
    );

    const source  = isProject ? 'project' : 'ai_validation';
    const updates = [];
    for (const concept_id of concepts_demonstrated) {
      const existing = await db.collection('concepts').findOne({ concept_id });

      // A weak project only demotes the concepts it names as missed: it cannot say
      // which one broke, so the rest keep their schedule and only log the score.
      if (isProject && final_score < 75 && !missed.has(concept_id)) {
        await db.collection('concepts').updateOne(
          { concept_id },
          { $push: { history: { date: new Date(), score: final_score, source } } }
        );
        continue;
      }

      const { interval_days, ease_factor, next_review } =
        sm2(final_score, existing, { project: isProject });

      await db.collection('concepts').updateOne(
        { concept_id },
        {
          $set: {
            lesson_id,
            last_reviewed:  new Date(),
            next_review,
            interval_days,
            ease_factor,
            mastered:       final_score >= 75,
            mastery_source: source,
            ...(existing ? {} : { first_seen: new Date() })
          },
          $push: {
            history: {
              date:   new Date(),
              score:  final_score,
              source
            }
          }
        },
        { upsert: true }
      );

      updates.push({ concept_id, next_review, interval_days });
    }

    const earliest = updates.reduce(
      (min, c) => (c.next_review < min ? c.next_review : min),
      updates[0]?.next_review ?? new Date()
    );

    const next_review_label = updates.length
      ? earliest.toLocaleDateString(languageLocale(), { weekday: 'long', day: 'numeric', month: 'long' })
      : null;

    res.json({
      ok: true,
      concepts_updated: updates.length,
      next_review: next_review_label
    });

  } catch (err) {
    console.error('progress POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Grouped in JS, not an aggregation pipeline: the sandbox store (memdb.js) has
// no aggregate().

// Model-written text: "janela deslizante" and "Janela Deslizante." must collapse.
const normalise = s => String(s)
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function groupMisconceptions(sections) {
  const byKey = new Map();

  for (const s of sections) {
    for (const text of s.misconceptions || []) {
      const key = normalise(text);
      if (!key) continue;

      const at  = s.recorded_at ? new Date(s.recorded_at) : null;
      const hit = byKey.get(key) || { key, text, count: 0, concepts: [], lessons: [], last_seen: null };

      hit.count += 1;
      // Latest phrasing wins: it is the one the user last read.
      if (!hit.last_seen || (at && at > hit.last_seen)) { hit.last_seen = at; hit.text = text; }
      if (s.concept_id && !hit.concepts.includes(s.concept_id)) hit.concepts.push(s.concept_id);
      if (s.lesson_id  && !hit.lessons.includes(s.lesson_id))   hit.lessons.push(s.lesson_id);

      byKey.set(key, hit);
    }
  }

  return [...byKey.values()].sort((a, b) =>
    b.count - a.count || new Date(b.last_seen ?? 0) - new Date(a.last_seen ?? 0));
}

router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const today = new Date();

    const [concepts, lessons, conversations, sections] = await Promise.all([
      db.collection('concepts').find({}).toArray(),
      db.collection('lessons').find({}).sort({ completed_at: -1 }).limit(20).toArray(),
      db.collection('conversations').find({}).sort({ recorded_at: -1 }).toArray(),
      db.collection('section_results').find({}).toArray()
    ]);

    for (const lesson of lessons) {
      if (!lesson.sections?.length) {
        lesson.sections = await db.collection('section_results')
          .find({ lesson_id: lesson.lesson_id })
          .sort({ recorded_at: 1 })
          .toArray();
      }
    }

    const pending_reviews = concepts.filter(
      c => c.next_review && new Date(c.next_review) <= today
    );

    res.json({
      concepts,
      lessons,
      conversations,
      pending_reviews,
      misconceptions: groupMisconceptions(sections)
    });

  } catch (err) {
    console.error('progress GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
