import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePerformanceScore,
  detectPillar,
  growthDesignFor,
  scoreShareability,
} from '../server/growth-engine.mjs';

test('growth engine classifies messages and produces an original creative brief', () => {
  const quote = 'Your discipline decides the future your mood keeps delaying.';
  const design = growthDesignFor(quote, 'reel', 3, []);
  assert.equal(detectPillar(quote), 'discipline');
  assert.equal(design.growth.pillar, 'discipline');
  assert.ok(design.growth.hook.length > 15);
  assert.equal(design.growth.cta, '');
  assert.ok(scoreShareability(quote) >= 70);
  assert.ok(design.duration >= 5 && design.duration <= 16);
});

test('performance score rewards retention, shares and saves', () => {
  const post = { format: 'reel', design: { duration: 8 } };
  const weak = calculatePerformanceScore(post, {
    reach: 500,
    averageWatchTimeMs: 1200,
    shares: 0,
    saved: 0,
    likes: 4,
    comments: 0,
  });
  const strong = calculatePerformanceScore(post, {
    reach: 500,
    averageWatchTimeMs: 6200,
    shares: 18,
    saved: 22,
    likes: 45,
    comments: 8,
  });
  assert.ok(strong.score > weak.score);
  assert.equal(strong.confidence, 100);
});

test('growth engine exploits measured recipes while preserving experiments', () => {
  const posts = ['noir-impact', 'mono-pulse'].map((recipe, index) => ({
    format: 'reel',
    design: {
      growth: { recipe },
      performance: { reach: 500, score: 90 - index * 10, confidence: 100 },
    },
  }));
  const exploited = growthDesignFor('Keep going when the result feels delayed.', 'reel', 1, posts);
  const explored = growthDesignFor('Keep going when the result feels delayed.', 'reel', 4, posts);
  assert.equal(exploited.growth.selection, 'exploit');
  assert.equal(explored.growth.selection, 'explore');
});

test('legacy posts teach the engine through their matching visual template', () => {
  const posts = [
    {
      format: 'reel',
      design: {
        template: 'midnight',
        animation: 'drift',
        performance: { reach: 500, score: 92, confidence: 100 },
      },
    },
    {
      format: 'reel',
      design: {
        template: 'paper',
        animation: 'pan',
        performance: { reach: 500, score: 72, confidence: 100 },
      },
    },
  ];
  const design = growthDesignFor('Keep going when the result feels delayed.', 'reel', 1, posts);
  assert.equal(design.growth.selection, 'exploit');
  assert.equal(design.growth.recipe, 'editorial-calm');
});
