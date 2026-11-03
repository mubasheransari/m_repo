import { BadRequestException } from '@nestjs/common';
import { QuizDef, QuizQuestion } from './quiz.catalog';

export type Answers = Record<string, string>;

/** How well an "I am flexible" answer fits any other answer. */
export const FLEX_SIMILARITY = 0.75;

/** Checks a set of answers against the quiz and returns a clean copy. Every question must be answered with a real option. */
export function cleanAnswers(quiz: QuizDef, raw: unknown): Answers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Send your answers as {questionId: optionId}');
  const input = raw as Record<string, unknown>;
  const known = new Set(quiz.questions.map((q) => q.id));
  if (Object.keys(input).some((k) => !known.has(k))) throw new BadRequestException('Your answers include a question that is not part of this quiz');
  const out: Answers = {};
  for (const q of quiz.questions) {
    const v = input[q.id];
    if (v === undefined || v === null) throw new BadRequestException(`Please answer all ${quiz.questions.length} questions`);
    if (typeof v !== 'string' || !q.options.some((o) => o.id === v)) throw new BadRequestException(`That is not one of the choices for: ${q.text}`);
    out[q.id] = v;
  }
  return out;
}

/** 0..1: how closely two answers to one question agree. */
export function similarity(q: QuizQuestion, a: string, b: string): number {
  if (a === b) return 1;
  const oa = q.options.find((o) => o.id === a);
  const ob = q.options.find((o) => o.id === b);
  if (!oa || !ob) return 0;
  if (oa.flex || ob.flex) return FLEX_SIMILARITY;
  if (q.kind === 'scale') {
    const line = q.options.filter((o) => !o.flex); // the "flexible" option is not a point on the scale
    const ia = line.findIndex((o) => o.id === a);
    const ib = line.findIndex((o) => o.id === b);
    return line.length > 1 ? 1 - Math.abs(ia - ib) / (line.length - 1) : 1;
  }
  return 0;
}

export interface Comparison {
  score: number; // 0..100
  topics: { topic: string; score: number; questions: number }[];
  items: { questionId: string; similarity: number }[];
}

/** The compatibility of two sets of answers: a weighted average of how closely each question agrees. */
export function compare(quiz: QuizDef, a: Answers, b: Answers): Comparison {
  let sum = 0;
  let total = 0;
  const byTopic = new Map<string, { sum: number; total: number; questions: number }>();
  const items: Comparison['items'] = [];

  for (const q of quiz.questions) {
    const s = similarity(q, a[q.id], b[q.id]);
    sum += s * q.weight;
    total += q.weight;
    const t = byTopic.get(q.topic) ?? { sum: 0, total: 0, questions: 0 };
    t.sum += s * q.weight;
    t.total += q.weight;
    t.questions += 1;
    byTopic.set(q.topic, t);
    items.push({ questionId: q.id, similarity: Math.round(s * 100) / 100 });
  }

  return {
    score: total ? Math.round((sum / total) * 100) : 0,
    topics: [...byTopic.entries()].map(([topic, t]) => ({ topic, score: Math.round((t.sum / t.total) * 100), questions: t.questions })),
    items,
  };
}

export type Verdict = 'EXCELLENT' | 'STRONG' | 'GOOD' | 'MIXED' | 'LOW';

/** A plain-language reading of a score. The app picks colours from the key. */
export function verdict(score: number): { key: Verdict; title: string; text: string } {
  if (score >= 85) return { key: 'EXCELLENT', title: 'Excellent match', text: 'You see eye to eye on almost everything that was asked.' };
  if (score >= 70) return { key: 'STRONG', title: 'Strong match', text: 'You agree on most things. A few differences are worth talking about.' };
  if (score >= 55) return { key: 'GOOD', title: 'Good foundation', text: 'You share a lot, and you differ on some important points. Talk them through.' };
  if (score >= 40) return { key: 'MIXED', title: 'Some real differences', text: 'You see several things differently. Honest conversation will show if that can work.' };
  return { key: 'LOW', title: 'Very different views', text: 'Your answers differ a lot. It is worth asking whether these differences matter to you.' };
}

export const levelOf = (s: number): 'ALIGNED' | 'CLOSE' | 'DIFFERENT' => (s >= 0.8 ? 'ALIGNED' : s >= 0.5 ? 'CLOSE' : 'DIFFERENT');
