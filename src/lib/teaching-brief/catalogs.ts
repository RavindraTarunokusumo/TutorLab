export const SUBJECTS = [
  ["mathematics", "Mathematics"],
  ["natural-sciences", "Natural sciences"],
  ["computer-science", "Computer science"],
  ["languages-linguistics", "Languages and linguistics"],
  ["literature", "Literature"],
  ["social-sciences", "Social sciences"],
  ["humanities", "Humanities"],
  ["business-economics", "Business and economics"],
  ["health-medicine", "Health and medicine"],
  ["engineering-technology", "Engineering and technology"],
  ["law", "Law"],
  ["arts-design", "Arts and design"],
  ["education", "Education"],
  ["interdisciplinary", "Interdisciplinary studies"],
] as const;

export type SubjectId = (typeof SUBJECTS)[number][0];

const COMMON_TOPICS = [
  ["foundations", "Foundations"], ["theory", "Theory"],
  ["methods", "Methods and problem solving"], ["applications", "Applications"],
  ["research", "Research and analysis"], ["other-topic", "Other topic"],
] as const;

const TOPIC_OVERRIDES: Partial<Record<SubjectId, readonly (readonly [string, string])[]>> = {
  mathematics: [["arithmetic", "Arithmetic"], ["algebra", "Algebra"], ["geometry", "Geometry"], ["calculus", "Calculus"], ["statistics-probability", "Statistics and probability"], ["discrete-mathematics", "Discrete mathematics"], ["other-topic", "Other topic"]],
  "natural-sciences": [["biology", "Biology"], ["chemistry", "Chemistry"], ["physics", "Physics"], ["earth-science", "Earth and environmental science"], ["astronomy", "Astronomy"], ["other-topic", "Other topic"]],
  "computer-science": [["programming", "Programming"], ["algorithms-data-structures", "Algorithms and data structures"], ["software-engineering", "Software engineering"], ["data-ai", "Data science and AI"], ["systems-networks", "Systems and networks"], ["cybersecurity", "Cybersecurity"], ["other-topic", "Other topic"]],
  "languages-linguistics": [["language-learning", "Language learning"], ["grammar", "Grammar"], ["writing-composition", "Writing and composition"], ["phonetics-phonology", "Phonetics and phonology"], ["linguistics", "Linguistics"], ["translation", "Translation"], ["other-topic", "Other topic"]],
  "business-economics": [["economics", "Economics"], ["accounting-finance", "Accounting and finance"], ["management", "Management"], ["marketing", "Marketing"], ["entrepreneurship", "Entrepreneurship"], ["other-topic", "Other topic"]],
  "health-medicine": [["anatomy-physiology", "Anatomy and physiology"], ["clinical-medicine", "Clinical medicine"], ["nursing", "Nursing"], ["public-health", "Public health"], ["pharmacology", "Pharmacology"], ["other-topic", "Other topic"]],
  "engineering-technology": [["mechanical", "Mechanical engineering"], ["electrical-electronic", "Electrical and electronic engineering"], ["civil", "Civil engineering"], ["chemical", "Chemical engineering"], ["design-manufacturing", "Design and manufacturing"], ["other-topic", "Other topic"]],
};

export const STUDENT_LEVELS = [
  ["early-childhood", "Early childhood"], ["primary", "Primary / elementary"],
  ["lower-secondary", "Lower secondary"], ["upper-secondary", "Upper secondary"],
  ["vocational", "Vocational / technical"], ["undergraduate", "Undergraduate"],
  ["postgraduate", "Postgraduate"], ["professional", "Professional / continuing education"],
  ["adult-self-directed", "Adult / self-directed learning"],
] as const;

// Complete ISO 639-1 two-letter code set. Labels are derived with Intl.DisplayNames.
export const LANGUAGE_CODES = (`aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu`).split(" ") as readonly string[];

const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
export const LANGUAGES = LANGUAGE_CODES
  .map((code) => [code, displayNames.of(code) ?? code] as const)
  .sort((a, b) => a[1].localeCompare(b[1]));

export function topicsForSubject(subject: string | undefined) {
  return subject && isSubjectId(subject) ? (TOPIC_OVERRIDES[subject] ?? COMMON_TOPICS) : [];
}

export function isSubjectId(value: string): value is SubjectId {
  return SUBJECTS.some(([id]) => id === value);
}

export function catalogLabel(options: readonly (readonly [string, string])[], value: string) {
  return options.find(([id]) => id === value)?.[1] ?? value;
}
