// Rova's knowledge base: a small, curated set of general wellness notes for the six metrics.
//
// Rules for every entry:
// - General interpretation only: no diagnosis, no clinical or treatment recommendations.
// - An entry with a `source` paraphrases that page closely; the page was read when the entry was written.
// - An entry without a source is "Rova editorial": it explains how Rova or wearables measure things,
//   never a health claim.
// - Answers may only cite entries that retrieval returned for that question (see guardrails.ts).

import type { MetricId } from "../domain/schema";

export interface KnowledgeSource {
  name: string;
  url: string;
}

export interface KnowledgeEntry {
  id: string;
  /** Metrics this entry is about. "general" entries apply to any metric. */
  metrics: (MetricId | "general")[];
  title: string;
  text: string;
  /** Words that suggest a question needs this entry. Lower case, matched as word prefixes. */
  terms: string[];
  /** null = Rova editorial (how Rova or trackers work), not an outside claim. */
  source: KnowledgeSource | null;
}

const CDC_SLEEP: KnowledgeSource = { name: "CDC, About Sleep", url: "https://www.cdc.gov/sleep/about/index.html" };
const AHA_HR: KnowledgeSource = { name: "American Heart Association, All About Heart Rate", url: "https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse" };
const CC_HRV: KnowledgeSource = { name: "Cleveland Clinic, Heart Rate Variability", url: "https://my.clevelandclinic.org/health/symptoms/21773-heart-rate-variability-hrv" };
const CC_VITALS: KnowledgeSource = { name: "Cleveland Clinic, Vital Signs", url: "https://my.clevelandclinic.org/health/articles/10881-vital-signs" };
const CC_BBT: KnowledgeSource = { name: "Cleveland Clinic, Basal Body Temperature", url: "https://my.clevelandclinic.org/health/articles/21065-basal-body-temperature" };
const CLUE_BBT: KnowledgeSource = { name: "Clue, Basal Body Temperature", url: "https://helloclue.com/articles/cycle-a-z/basal-body-temperature-bbt-what-is-it-how-is-it-used-to-estimate-ovulation" };

export const KNOWLEDGE: KnowledgeEntry[] = [
  // Sleep
  {
    id: "sleep-hours-adults",
    metrics: ["sleep"],
    title: "How much sleep adults are advised to get",
    text: "The CDC advises adults aged 18 to 60 to get 7 or more hours of sleep a night, 7 to 9 hours at ages 61 to 64, and 7 to 8 hours from 65 on.",
    terms: ["enough", "normal", "recommend", "advis", "how much", "hours", "should", "good", "bad", "healthy", "typical", "short", "long"],
    source: CDC_SLEEP,
  },
  {
    id: "sleep-quality-routine",
    metrics: ["sleep"],
    title: "What shapes sleep quality",
    text: "The CDC describes quality sleep as uninterrupted and refreshing. It lists a regular bed and wake time as a healthy sleep habit, and notes that caffeine late in the day, screens before bed, and large meals or alcohol close to bedtime can affect sleep.",
    terms: ["quality", "score", "restless", "routine", "schedule", "why", "affect", "worse", "better", "drop", "dip", "poor"],
    source: CDC_SLEEP,
  },
  {
    id: "sleep-score-tracker",
    metrics: ["sleep"],
    title: "Sleep score is your tracker's own measure",
    text: "A sleep score is calculated by your tracker with its own method, so it has no universal scale. It is most useful compared with your own nights rather than with other people or other devices.",
    terms: ["score", "mean", "scale", "normal", "good", "bad", "compare"],
    source: null,
  },

  // HRV
  {
    id: "hrv-what-it-is",
    metrics: ["hrv"],
    title: "What HRV measures",
    text: "Heart rate variability is the slight change in the time between one heartbeat and the next. Cleveland Clinic describes a higher HRV as a sign the body adapts to change easily.",
    terms: ["what", "mean", "measure", "high", "higher", "good", "explain"],
    source: CC_HRV,
  },
  {
    id: "hrv-individual",
    metrics: ["hrv"],
    title: "HRV is personal",
    text: "Cleveland Clinic notes that an HRV that is normal for one person may not be normal for someone else, and that comparing your current HRV with your own past values is what makes it useful.",
    terms: ["normal", "good", "bad", "healthy", "typical", "compare", "average", "low", "range", "should"],
    source: CC_HRV,
  },
  {
    id: "hrv-influences",
    metrics: ["hrv", "sleep"],
    title: "Things associated with lower HRV",
    text: "Cleveland Clinic lists lower sleep quality or amount, and stress, anxiety or depression, among the things that lower HRV. A healthcare provider is the right person to explain what a person's HRV means for them.",
    terms: ["why", "drop", "dip", "fall", "fell", "low", "lower", "lowest", "decreas", "cause", "affect", "reason", "sleep", "stress", "change"],
    source: CC_HRV,
  },

  // Resting heart rate
  {
    id: "rhr-normal-range",
    metrics: ["rhr"],
    title: "The usual adult resting heart rate range",
    text: "The American Heart Association describes a normal resting heart rate as 60 to 100 beats per minute when sitting or lying, calm and feeling well, and notes that a lower resting heart rate is common in athletes.",
    terms: ["normal", "range", "healthy", "typical", "good", "bad", "low", "high", "should", "average", "ok", "fine"],
    source: AHA_HR,
  },
  {
    id: "rhr-influences",
    metrics: ["rhr", "temperature"],
    title: "Things that move resting heart rate",
    text: "The American Heart Association notes that a rise in body temperature may raise heart rate; that stress, anxiety, strong emotions and pain can raise it; and that some medications, such as beta blockers, can slow it.",
    terms: ["why", "rise", "rose", "up", "higher", "high", "increas", "cause", "affect", "reason", "change", "temperature", "stress"],
    source: AHA_HR,
  },

  // Training
  {
    id: "training-load-tracker",
    metrics: ["training"],
    title: "Training load is a tracker score",
    text: "Training load is a score your tracker calculates from your activity with its own method, so it has no unit and no universal healthy range. It is most meaningful compared with your own days.",
    terms: ["what", "mean", "normal", "good", "bad", "high", "too", "much", "range", "scale", "unit"],
    source: null,
  },
  {
    id: "training-exercise-body-temperature",
    metrics: ["training", "temperature"],
    title: "Exercise affects body temperature",
    text: "Cleveland Clinic lists exercise, hot or cold surroundings, hot or cold food and drink, and strong emotions among the everyday things that change body temperature.",
    terms: ["exercis", "workout", "warm", "hot", "why", "up", "rise", "affect"],
    source: CC_VITALS,
  },

  // Temperature
  {
    id: "temperature-normal",
    metrics: ["temperature"],
    title: "Normal body temperature varies",
    text: "Cleveland Clinic gives an average body temperature of about 37 °C, with normal values for a healthy person ranging from about 36.6 °C to 37.3 °C or slightly higher.",
    terms: ["normal", "range", "fever", "typical", "high", "healthy", "ok", "fine"],
    source: CC_VITALS,
  },
  {
    id: "temperature-deviation-tracker",
    metrics: ["temperature"],
    title: "What a temperature deviation is",
    text: "A temperature deviation is the difference from your tracker's own baseline, not your actual body temperature, so a value like +0.2 °C means slightly warmer than your usual, not a temperature reading.",
    terms: ["deviation", "mean", "what", "baseline", "up", "high", "warm", "sick", "fever", "normal"],
    source: null,
  },
  {
    id: "temperature-influences",
    metrics: ["temperature", "sleep"],
    title: "Everyday things that shift temperature readings",
    text: "Cleveland Clinic lists fever from illness, too little sleep, alcohol and stress among the things that change basal body temperature readings, along with some medications and travel across time zones.",
    terms: ["why", "up", "rise", "rose", "high", "warm", "cause", "affect", "reason", "sick", "ill", "sleep", "alcohol", "stress", "change"],
    source: CC_BBT,
  },
  {
    id: "temperature-cycle",
    metrics: ["temperature"],
    title: "Temperature and the menstrual cycle",
    text: "For people who menstruate, resting temperature is slightly lower in the first half of the cycle and rises by roughly 0.3 to 0.6 °C after ovulation, staying higher until the next period.",
    terms: ["why", "up", "rise", "rose", "cycle", "period", "ovulat", "hormon", "warm", "change", "pattern"],
    source: CLUE_BBT,
  },

  // Respiration
  {
    id: "respiration-normal",
    metrics: ["respiration"],
    title: "Usual adult breathing rate at rest",
    text: "Cleveland Clinic gives a normal breathing rate for an adult at rest as 12 to 18 breaths per minute.",
    terms: ["normal", "range", "typical", "healthy", "good", "bad", "high", "low", "should", "ok", "fine"],
    source: CC_VITALS,
  },
  {
    id: "respiration-steady",
    metrics: ["respiration"],
    title: "Sleeping respiration is usually steady",
    text: "Breathing rate during sleep usually stays in a narrow band for each person, so it is best read against your own usual range, where small shifts are easier to see.",
    terms: ["steady", "change", "shift", "why", "up", "rise", "pattern", "compare", "usual"],
    source: null,
  },

  // How Rova reads data (general)
  {
    id: "rova-usual-range",
    metrics: ["general"],
    title: "How Rova defines your usual range",
    text: "Rova's usual range is your own average across the file, give or take one standard deviation. It describes where most of your days fell; it is not a medical reference range.",
    terms: ["usual", "range", "normal", "baseline", "typical", "average", "compare"],
    source: null,
  },
  {
    id: "rova-correlation",
    metrics: ["general"],
    title: "Moving together is not the same as causing",
    text: "When two measures change on the same days, the data shows they coincided. It cannot show that one caused the other; other things not in the data may explain both.",
    terms: ["why", "cause", "because", "reason", "due", "explain", "led", "affect", "relat", "connect", "link", "together"],
    source: null,
  },
];

export function knowledgeById(id: string): KnowledgeEntry | undefined {
  return KNOWLEDGE.find((k) => k.id === id);
}

export function sourceLabel(k: KnowledgeEntry): string {
  return k.source ? k.source.name : "Rova editorial";
}
