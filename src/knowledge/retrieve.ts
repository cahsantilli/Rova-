// Retrieval over Rova's knowledge base. Deliberately simple and inspectable: the KB is a few
// dozen entries, so lexical matching on curated terms plus the metric in focus is enough, and
// every retrieved entry can be traced back to the words that pulled it in.

import type { MetricId } from "../domain/schema";
import { KNOWLEDGE, type KnowledgeEntry } from "./kb";

export const MAX_RETRIEVED = 3;

/** Words that mean the person wants general context, not just their numbers. */
const KNOWLEDGE_INTENT = /\b(normal|healthy|typical|why|cause[sd]?|because|reason|mean|means|meaning|explain|affect|affects|enough|good|bad|ok|okay|fine|should|sick|ill|fever|worr(y|ied)|concern|recommend|advis|usual|expected|high for|low for|too (high|low|much|little))\b/i;

const METRIC_WORDS: Record<MetricId, RegExp> = {
  sleep: /\bsleep|\bslept|\bnights?\b|\bbed\b/i,
  hrv: /\bhrv\b|variability/i,
  rhr: /resting heart|heart rate|\brhr\b|\bpulse\b/i,
  training: /\btrain|\bload\b|workout|exercis/i,
  temperature: /\btemp|\bfever|\bwarm/i,
  respiration: /respirat|\bbreath/i,
};

export function needsKnowledge(question: string): boolean {
  return KNOWLEDGE_INTENT.test(question);
}

export function metricsMentioned(question: string): MetricId[] {
  return (Object.keys(METRIC_WORDS) as MetricId[]).filter((m) => METRIC_WORDS[m].test(question));
}

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function termHits(entry: KnowledgeEntry, question: string, words: string[]): string[] {
  const q = question.toLowerCase();
  return entry.terms.filter((t) => (t.includes(" ") ? q.includes(t) : words.some((w) => w.startsWith(t))));
}

export interface Retrieved {
  entry: KnowledgeEntry;
  score: number;
  /** The question words that matched this entry, kept for inspection and tests. */
  matched: string[];
}

/**
 * Returns up to MAX_RETRIEVED knowledge entries for a question, or none when the question only
 * asks about the person's own values. Entries must be about a metric in view or named in the question.
 */
export function retrieve(question: string, metricId?: MetricId): Retrieved[] {
  if (!needsKnowledge(question)) return [];
  const words = tokens(question);
  const mentioned = metricsMentioned(question);
  const relevant = new Set<MetricId>([...(metricId ? [metricId] : []), ...mentioned]);
  const scored: Retrieved[] = [];
  for (const entry of KNOWLEDGE) {
    const matched = termHits(entry, question, words);
    if (matched.length === 0) continue;
    const isGeneral = entry.metrics.includes("general");
    const metricMatch = entry.metrics.some((m) => m !== "general" && relevant.has(m));
    // With no metric in view or named, any metric's entry may apply.
    if (!isGeneral && !metricMatch && relevant.size > 0) continue;
    // The primary metric of an entry is listed first; matching it counts more than a side mention.
    const primaryMatch = !isGeneral && relevant.has(entry.metrics[0] as MetricId);
    // An entry that is mainly about another metric needs more than one matching word.
    if (!isGeneral && !primaryMatch && relevant.size > 0 && matched.length < 2) continue;
    // General entries (how to read any metric) apply to whatever is in view, like a primary match.
    const score = matched.length + (primaryMatch || isGeneral ? 2 : metricMatch ? 1 : 0);
    scored.push({ entry, score, matched });
  }
  const general = (r: Retrieved) => (r.entry.metrics.includes("general") ? 0 : 1);
  return scored.sort((a, b) => b.score - a.score || general(a) - general(b) || KNOWLEDGE.indexOf(a.entry) - KNOWLEDGE.indexOf(b.entry)).slice(0, MAX_RETRIEVED);
}
