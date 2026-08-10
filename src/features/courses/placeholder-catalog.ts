/**
 * File:        src/features/courses/placeholder-catalog.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: A stock curriculum per degree, used when no model is configured.
 *
 *              WHY THIS EXISTS. Step 2 with an empty list is a dead end: the
 *              whole matching engine runs on shared courses, so a student who
 *              picks none of them cannot be matched on anything. Before this,
 *              a degree with no catalog and no API key produced exactly that.
 *
 *              WHAT IT IS NOT. These are conventional courses for the subject,
 *              not this university's syllabus — nobody checked them against a
 *              registrar, and course codes here are ours, not the
 *              institution's. They are stored with `source = 'placeholder'` and
 *              shown with the same unverified marker as generated ones, for the
 *              same reason: the app must not state something false about a real
 *              institution, and a student who joins "Constitutional Law" needs
 *              to know we do not actually know their university teaches it.
 *
 *              Being written by hand is the point. A fixed list is inspectable,
 *              costs nothing, is identical on every machine, and lets the whole
 *              flow be demonstrated and tested without an API key — which the
 *              graders will not have.
 * Version:     0.11.0
 *
 * Modifications:
 *     0.11.0 - 2026-08-09 - Initial implementation
 */

import type { GeneratedCourse } from '@/features/courses/catalog-schema';

/** How many courses a placeholder catalog may contain. */
const MAX_PLACEHOLDER_COURSES = 12;

/**
 * A subject, matched by keyword against the degree's name.
 *
 * `match` holds lowercase fragments; a degree name containing any of them takes
 * this subject. Names are the courses a first degree in the subject almost
 * always contains, which is what makes a generic list useful at all.
 */
interface Subject {
  key: string;
  match: string[];
  faculty: string;
  courses: string[];
}

/*
 * Order matters. A degree named "Business & Computer Science" matches both
 * subjects, and the earlier entry contributes first — so the more specific
 * subjects are listed before the broad ones.
 */
const SUBJECTS: Subject[] = [
  {
    key: 'computer-science',
    match: ['computer science', 'computer engineering', 'software', 'informatics'],
    faculty: 'Computer Science',
    courses: [
      'Introduction to Computer Science',
      'Discrete Mathematics',
      'Data Structures and Algorithms',
      'Computer Organisation',
      'Linear Algebra',
      'Calculus I',
      'Object-Oriented Programming',
      'Operating Systems',
      'Databases',
      'Computer Networks',
      'Theory of Computation',
      'Software Engineering',
    ],
  },
  {
    key: 'data-science',
    match: ['data science', 'data engineering', 'machine learning', 'artificial intelligence'],
    faculty: 'Data Science',
    courses: [
      'Introduction to Data Science',
      'Probability and Statistics',
      'Linear Algebra',
      'Programming for Data Science',
      'Data Structures and Algorithms',
      'Databases and Data Modelling',
      'Machine Learning',
      'Statistical Inference',
      'Data Visualisation',
      'Deep Learning',
      'Big Data Systems',
      'Ethics in Data Science',
    ],
  },
  {
    key: 'law',
    match: ['law', 'legal', 'jurisprudence'],
    faculty: 'Law',
    courses: [
      'Introduction to Law',
      'Constitutional Law',
      'Contract Law',
      'Criminal Law',
      'Tort Law',
      'Property Law',
      'Administrative Law',
      'Civil Procedure',
      'Legal Research and Writing',
      'Corporate Law',
      'International Law',
      'Legal Ethics',
    ],
  },
  {
    key: 'economics',
    match: ['economics', 'econometrics'],
    faculty: 'Economics',
    courses: [
      'Principles of Economics',
      'Microeconomics',
      'Macroeconomics',
      'Calculus for Economists',
      'Statistics for Economists',
      'Econometrics',
      'Money and Banking',
      'Public Economics',
      'International Trade',
      'Game Theory',
      'Labour Economics',
      'Economic History',
    ],
  },
  {
    key: 'psychology',
    match: ['psychology', 'behavioural science', 'behavioral science', 'cognitive'],
    faculty: 'Psychology',
    courses: [
      'Introduction to Psychology',
      'Statistics for Psychology',
      'Research Methods in Psychology',
      'Developmental Psychology',
      'Social Psychology',
      'Cognitive Psychology',
      'Biological Psychology',
      'Personality Theory',
      'Abnormal Psychology',
      'Psychological Assessment',
      'Learning and Memory',
      'Ethics in Psychological Research',
    ],
  },
  {
    key: 'business',
    match: ['business', 'management', 'administration', 'accounting', 'finance', 'marketing'],
    faculty: 'Business Administration',
    courses: [
      'Introduction to Management',
      'Financial Accounting',
      'Microeconomics for Business',
      'Business Statistics',
      'Marketing Management',
      'Corporate Finance',
      'Organisational Behaviour',
      'Operations Management',
      'Managerial Accounting',
      'Business Law',
      'Strategic Management',
      'Business Ethics',
    ],
  },
  {
    key: 'entrepreneurship',
    match: ['entrepreneur', 'innovation', 'venture'],
    faculty: 'Entrepreneurship',
    courses: [
      'Foundations of Entrepreneurship',
      'Opportunity Recognition',
      'Financial Accounting for Startups',
      'Product Management',
      'Marketing for New Ventures',
      'Venture Finance',
      'Business Model Design',
      'Negotiation',
      'Intellectual Property Basics',
      'Growth and Scaling',
      'Startup Law',
      'Venture Capstone Project',
    ],
  },
  {
    key: 'government',
    match: ['government', 'political', 'politics', 'public policy', 'international relations'],
    faculty: 'Government',
    courses: [
      'Introduction to Political Science',
      'Comparative Politics',
      'International Relations',
      'Political Theory',
      'Public Policy Analysis',
      'Research Methods in Political Science',
      'Statistics for Social Science',
      'Constitutional Systems',
      'Public Administration',
      'Political Economy',
      'Diplomacy and Negotiation',
      'Security Studies',
    ],
  },
  {
    key: 'communications',
    match: ['communication', 'media', 'journalism', 'public relations'],
    faculty: 'Communications',
    courses: [
      'Introduction to Communications',
      'Media Theory',
      'Writing for Media',
      'Research Methods in Communications',
      'Digital Media',
      'Visual Communication',
      'Public Opinion',
      'Media Law and Ethics',
      'Strategic Communication',
      'Audience Research',
      'Documentary Production',
      'Communications Capstone',
    ],
  },
  {
    key: 'electrical-engineering',
    match: ['electrical', 'electronics'],
    faculty: 'Electrical Engineering',
    courses: [
      'Calculus I',
      'Calculus II',
      'Physics: Mechanics',
      'Physics: Electricity and Magnetism',
      'Linear Algebra',
      'Circuit Theory',
      'Signals and Systems',
      'Digital Systems',
      'Electronic Devices',
      'Electromagnetic Fields',
      'Control Systems',
      'Communication Systems',
    ],
  },
  {
    key: 'engineering',
    match: ['engineering', 'mechanical', 'industrial', 'civil'],
    faculty: 'Engineering',
    courses: [
      'Calculus I',
      'Calculus II',
      'Linear Algebra',
      'Physics: Mechanics',
      'Engineering Materials',
      'Statics and Dynamics',
      'Thermodynamics',
      'Engineering Drawing and CAD',
      'Probability for Engineers',
      'Numerical Methods',
      'Engineering Economics',
      'Engineering Design Project',
    ],
  },
  {
    key: 'medicine-health',
    match: ['medicine', 'health', 'nursing', 'biomedical', 'pharmac'],
    faculty: 'Health Sciences',
    courses: [
      'Human Anatomy',
      'Human Physiology',
      'General Chemistry',
      'Biochemistry',
      'Cell Biology',
      'Microbiology',
      'Genetics',
      'Epidemiology',
      'Biostatistics',
      'Pharmacology',
      'Pathology',
      'Medical Ethics',
    ],
  },
  {
    key: 'natural-sciences',
    match: ['natural science', 'biology', 'chemistry', 'physics', 'mathematics', 'life science'],
    faculty: 'Natural Sciences',
    courses: [
      'Calculus I',
      'Calculus II',
      'Linear Algebra',
      'General Physics',
      'General Chemistry',
      'Introduction to Biology',
      'Probability and Statistics',
      'Organic Chemistry',
      'Laboratory Methods',
      'Scientific Computing',
      'Research Methods',
      'Science Communication',
    ],
  },
  {
    key: 'social-sciences',
    match: ['social science', 'sociology', 'anthropology', 'education', 'criminology'],
    faculty: 'Social Sciences',
    courses: [
      'Introduction to Sociology',
      'Social Theory',
      'Research Methods in Social Science',
      'Statistics for Social Science',
      'Introduction to Anthropology',
      'Social Psychology',
      'Qualitative Research',
      'Social Inequality',
      'Population and Society',
      'Public Policy',
      'Ethics in Social Research',
      'Social Science Capstone',
    ],
  },
  {
    key: 'arts-design',
    /* 'arts', not 'art': the shorter fragment also matches Cartography and Earth. */
    match: ['arts', 'design', 'architecture', 'music', 'film', 'theatre', 'theater', 'fine art'],
    faculty: 'Arts & Design',
    courses: [
      'History of Art and Design',
      'Drawing and Composition',
      'Colour and Form',
      'Typography',
      'Digital Design Tools',
      'Three-Dimensional Design',
      'Design Research',
      'Photography',
      'Interaction Design',
      'Portfolio Studio',
      'Professional Practice',
      'Final Design Project',
    ],
  },
  {
    key: 'humanities',
    match: ['humanities', 'history', 'philosophy', 'literature', 'linguistics', 'language'],
    faculty: 'Humanities',
    courses: [
      'Introduction to the Humanities',
      'Academic Writing',
      'World History',
      'Introduction to Philosophy',
      'Literary Analysis',
      'Historiography',
      'Introduction to Linguistics',
      'Ethics',
      'Cultural Studies',
      'Research Methods in the Humanities',
      'Comparative Literature',
      'Humanities Seminar',
    ],
  },
];

/**
 * Builds a course-code prefix from the degree's name.
 *
 * Scoped to the degree on purpose. `courses` has one `degree_id`, and codes are
 * unique per university, so a shared code like `CS-101` can only ever belong to
 * one degree — a second degree wanting it would silently get nothing. Deriving
 * the prefix from the degree name keeps every catalog complete.
 *
 * @param degreeName - The degree as stored.
 * @returns A short uppercase prefix, always at least one letter.
 */
export function codePrefix(degreeName: string): string {
  const words = degreeName
    .replace(/[^A-Za-z ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 || /^[A-Z]{2,}$/.test(word));

  if (words.length === 0) {
    return 'GEN';
  }

  /* One word gives a readable stem (LAW), several give initials (BCS). */
  return words.length === 1
    ? words[0].slice(0, 3).toUpperCase()
    : words
        .map((word) => word[0])
        .join('')
        .slice(0, 4)
        .toUpperCase();
}

/**
 * A degree whose name says nothing about the subject.
 *
 * 'Other' exists in the default degree list a new institution is provisioned
 * with, and naming courses after it produces "Introduction to Other".
 *
 * @param degreeName - The degree as stored.
 * @returns True when the name cannot be used in a course title.
 */
function isUnnamedDegree(degreeName: string): boolean {
  return /^(other|general|undeclared|n\/?a)$/i.test(degreeName.trim());
}

/** Titles for a degree whose name cannot appear in a course name. */
const UNNAMED_COURSES = [
  'Academic Writing',
  'Introduction to Research Methods',
  'Statistics and Data Analysis',
  'Critical Thinking',
  'Introduction to Economics',
  'Introduction to Psychology',
  'Ethics',
  'Quantitative Methods',
];

/**
 * The generic curriculum for a subject nobody recognised.
 *
 * Deliberately shaped around the degree's own name rather than inventing
 * subject matter: "Research Methods in Veterinary Medicine" is a safe claim in
 * a way that a guessed course title is not.
 *
 * @param degreeName - The degree as stored.
 * @returns Course titles.
 */
function genericCourses(degreeName: string): string[] {
  return [
    `Introduction to ${degreeName}`,
    'Academic Writing',
    `Foundations of ${degreeName}`,
    'Statistics and Data Analysis',
    `Research Methods in ${degreeName}`,
    `Theories of ${degreeName}`,
    'Quantitative Methods',
    `Ethics in ${degreeName}`,
    `Contemporary Issues in ${degreeName}`,
    `${degreeName} Seminar`,
  ];
}

/**
 * Titles for a graduate degree.
 *
 * A master's or doctorate is not the bachelor's core over again, and offering
 * "Introduction to …" to a PhD student would look careless. The subject's own
 * list still supplies the specialised half.
 *
 * @param degreeName - The degree as stored.
 * @returns Course titles.
 */
function graduateCourses(degreeName: string): string[] {
  return [
    `Advanced Topics in ${degreeName}`,
    `Research Seminar in ${degreeName}`,
    'Research Design',
    'Advanced Statistical Methods',
    `Current Literature in ${degreeName}`,
    'Thesis Proposal',
  ];
}

/**
 * Builds a placeholder catalog for one degree.
 *
 * @param degreeName  - The degree as stored; drives both matching and codes.
 * @param degreeLevel - 'bachelors', 'masters' or 'phd'.
 * @returns Between one and twelve courses, deduplicated, with unique codes.
 */
export function placeholderCatalog(
  degreeName: string,
  degreeLevel: string,
): GeneratedCourse[] {
  const name = degreeName.trim();
  const needle = name.toLowerCase();

  const matched = SUBJECTS.filter((subject) =>
    subject.match.some((fragment) => needle.includes(fragment)),
  );

  const faculty = matched[0]?.faculty ?? name;

  /*
   * A combined degree ("Economics & Computer Science") takes from both subjects
   * rather than picking a winner — those students really do sit in both sets of
   * lectures, and showing only half of them would match them on half their
   * courses.
   */
  let titles: string[];

  if (matched.length === 0 && isUnnamedDegree(name)) {
    titles = UNNAMED_COURSES;
  } else if (matched.length === 0) {
    titles = degreeLevel === 'bachelors' ? genericCourses(name) : graduateCourses(name);
  } else if (matched.length === 1) {
    titles = matched[0].courses;
  } else {
    /* Interleaved, so the cap does not cut one subject off entirely. */
    titles = [];
    const perSubject = Math.ceil(MAX_PLACEHOLDER_COURSES / matched.length);
    for (let index = 0; index < perSubject; index += 1) {
      for (const subject of matched) {
        if (subject.courses[index]) {
          titles.push(subject.courses[index]);
        }
      }
    }
  }

  if (degreeLevel !== 'bachelors' && matched.length > 0 && !isUnnamedDegree(name)) {
    /* Graduate framing first, then the subject's more advanced half. */
    titles = [...graduateCourses(name), ...titles.slice(-4)];
  }

  const prefix = codePrefix(name);
  const seen = new Set<string>();

  return titles
    .filter((title) => {
      const key = title.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, MAX_PLACEHOLDER_COURSES)
    .map((title, index) => ({
      /* 101, 102 … 201, 202 … so the codes read like a degree plan. */
      code: `${prefix}-${(Math.floor(index / 4) + 1) * 100 + (index % 4) + 1}`,
      name: title,
      faculty,
    }));
}
