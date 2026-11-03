/**
 * The compatibility quizzes members can send each other.
 *
 * How a question is scored when two members answer it:
 *  - kind "scale": the options run from one end to the other, so close answers earn partial credit
 *                  (one step apart on a 4-step scale = 67%, two steps = 33%).
 *  - kind "match": options are different choices, so only the same answer earns full credit.
 *  - an option marked `flex` ("I am flexible", "whatever Allah wills") fits any answer well (75%).
 *  - `weight` (1-3) is how much the question counts; `important` questions are called out when answers differ.
 *
 * Quizzes are versioned: change wording freely, but if you change the OPTIONS or QUESTIONS of a quiz that members
 * may already have answered, bump `version` and keep the old definition, or old results will no longer read correctly.
 */
export interface QuizOption { id: string; label: string; flex?: boolean }
export interface QuizQuestion {
  id: string;
  topic: string;
  text: string;
  kind: 'scale' | 'match';
  weight: 1 | 2 | 3;
  important?: boolean;
  options: QuizOption[];
}
export interface QuizDef {
  id: string;
  version: number;
  title: string;
  subtitle: string;
  description: string;
  icon: 'heart' | 'people' | 'flag';
  minutes: number;
  questions: QuizQuestion[];
}

const opts = (...labels: string[]): QuizOption[] => labels.map((label, i) => ({ id: String.fromCharCode(97 + i), label })); // a, b, c, ...
const flexLast = (o: QuizOption[]): QuizOption[] => o.map((x, i) => (i === o.length - 1 ? { ...x, flex: true } : x));

const MARRIAGE_VALUES: QuizDef = {
  id: 'marriage-values',
  version: 1,
  title: 'Marriage & Values',
  subtitle: 'Faith, family and the foundations of your marriage',
  description: 'How you each see faith, family involvement, roles and money once you are married.',
  icon: 'heart',
  minutes: 4,
  questions: [
    { id: 'mv1', topic: 'Faith', kind: 'scale', weight: 3, important: true, text: 'How central is practising Islam in your daily life?',
      options: opts('At the centre: I pray on time and follow the sunnah closely', 'Very important: I pray regularly and keep learning', 'Growing: I am working on being more consistent', 'Personal: my faith matters, but I am relaxed about practice') },
    { id: 'mv2', topic: 'Faith', kind: 'scale', weight: 2, text: 'How would you like prayer to look in your home?',
      options: opts('We pray together whenever we can', 'We encourage each other and often pray together', 'Each of us prays on our own, with gentle reminders', 'Each of us decides for ourselves') },
    { id: 'mv3', topic: 'Faith', kind: 'scale', weight: 2, text: 'How much Islamic learning do you want as a couple?',
      options: opts('Regular study together (classes, Quran, books)', 'Occasional classes or talks', 'Mostly personal learning', 'Not a priority right now') },
    { id: 'mv4', topic: 'Family', kind: 'scale', weight: 2, text: 'How involved should your families be in the decisions of your marriage?',
      options: opts('Closely involved in major decisions', 'Consulted often for advice', 'Consulted only on big matters', 'We decide on our own') },
    { id: 'mv5', topic: 'Roles', kind: 'scale', weight: 3, important: true, text: 'Which best describes your view of roles in marriage?',
      options: opts('Traditional: the husband provides and the wife manages the home', 'Mostly traditional, with some sharing', 'Shared: we split responsibilities by our strengths', 'Equal: everything is shared equally') },
    { id: 'mv6', topic: 'Roles', kind: 'scale', weight: 3, text: 'How do you see work and career after marriage?',
      options: opts('Both of us working is important to me', 'Both can work, as long as family comes first', 'One of us focuses on career, the other on the home', 'I would like one of us at home full time') },
    { id: 'mv7', topic: 'Money', kind: 'match', weight: 2, text: 'How should household money be managed?',
      options: flexLast(opts('One shared account for everything', 'Shared for the household, personal money stays personal', 'Mostly separate, and we split the costs', 'We will decide together as we go')) },
    { id: 'mv8', topic: 'Money', kind: 'scale', weight: 2, text: 'How do you approach interest (riba) in finances such as loans, mortgages and savings?',
      options: opts('I avoid it completely', 'I avoid it wherever possible', 'I accept it when there is no alternative', 'It is not a big concern for me') },
    { id: 'mv9', topic: 'Communication', kind: 'match', weight: 2, text: 'When we disagree on something important, I would want to…',
      options: opts('Talk it through right away', 'Take some time to calm down, then talk', 'Ask a trusted elder or imam for advice', 'Pray istikhara and decide together') },
    { id: 'mv10', topic: 'Character', kind: 'match', weight: 2, text: 'What matters most to you in a spouse?',
      options: opts('Good character and kindness', 'Strong religious commitment', 'Shared goals and ambition', 'Compatible families and background') },
  ],
};

const COMPATIBILITY: QuizDef = {
  id: 'compatibility-lifestyle',
  version: 1,
  title: 'Compatibility & Lifestyle',
  subtitle: 'Everyday habits, communication and how you live',
  description: 'The small daily things that decide whether living together feels easy: communication, money habits, home life and family time.',
  icon: 'people',
  minutes: 4,
  questions: [
    { id: 'cl1', topic: 'Social life', kind: 'match', weight: 1, text: 'My ideal weekend is…',
      options: opts('Quiet time at home', 'Time with family and a few close friends', 'A busy social calendar with lots of people', 'Travelling or exploring somewhere new') },
    { id: 'cl2', topic: 'Communication', kind: 'match', weight: 2, text: 'When something bothers me, I usually…',
      options: opts('Say it right away', 'Wait for the right moment', 'Write it down or message first', 'Keep it to myself unless it is serious') },
    { id: 'cl3', topic: 'Communication', kind: 'scale', weight: 1, text: 'How often do you like to be in touch during the day?',
      options: opts('Many times: I like to share small moments', 'A few times a day', 'Once or twice', 'Only when we meet or need to') },
    { id: 'cl4', topic: 'Money', kind: 'scale', weight: 2, text: 'My attitude to money is…',
      options: opts('Careful saver', 'Balanced: I save and I enjoy', 'I like spending on experiences', 'I spend freely and worry later') },
    { id: 'cl5', topic: 'Home life', kind: 'scale', weight: 1, text: 'How tidy do you like your home?',
      options: opts('Very tidy, everything in its place', 'Mostly tidy', 'Relaxed', 'Comfortably messy') },
    { id: 'cl6', topic: 'Home life', kind: 'scale', weight: 1, text: 'My daily rhythm is…',
      options: opts('Early bird', 'Mostly early', 'Flexible', 'Night owl') },
    { id: 'cl7', topic: 'Home life', kind: 'scale', weight: 1, text: 'What about meals?',
      options: opts('I like to cook most meals at home', 'A mix of home cooking and eating out', 'We would eat out often', 'Mostly takeaway or quick meals') },
    { id: 'cl8', topic: 'Family', kind: 'scale', weight: 2, text: 'How much time do you want with extended family?',
      options: opts('Very often, weekly or more', 'Regularly, a few times a month', 'On special occasions', 'Rarely') },
    { id: 'cl9', topic: 'Affection', kind: 'match', weight: 1, text: 'I feel most cared for when…',
      options: opts('I hear kind and thoughtful words', 'We spend quality time together', 'Someone helps me and shares the load', 'I receive thoughtful gifts') },
    { id: 'cl10', topic: 'Social life', kind: 'scale', weight: 2, text: 'How much of your life do you share on social media?',
      options: opts('A lot', 'Some', 'Very little', 'None') },
  ],
};

const FUTURE_GOALS: QuizDef = {
  id: 'future-goals',
  version: 1,
  title: 'Future Life & Goals',
  subtitle: 'Children, home, career and where you are heading',
  description: 'Whether you want the same future: children, where to live, careers, education and your long-term dreams.',
  icon: 'flag',
  minutes: 4,
  questions: [
    { id: 'fg1', topic: 'Children', kind: 'scale', weight: 3, important: true, text: 'How many children would you like?',
      options: flexLast(opts('None for now', 'One or two', 'Three or four', 'Five or more', 'Whatever Allah wills')) },
    { id: 'fg2', topic: 'Children', kind: 'scale', weight: 2, text: 'When would you like to start a family?',
      options: flexLast(opts('Soon after the nikah', 'After a year or two', 'After three years or more', 'I am not sure yet')) },
    { id: 'fg3', topic: 'Children', kind: 'match', weight: 2, text: 'How would you like to educate your children?',
      options: flexLast(opts('Islamic school', 'Mainstream school with Islamic learning at home', 'Home education', 'We will decide together')) },
    { id: 'fg4', topic: 'Home', kind: 'match', weight: 3, important: true, text: 'Where would you like to live long term?',
      options: flexLast(opts('Close to my family in my hometown', 'A different city in my country', 'Abroad', 'I am flexible')) },
    { id: 'fg5', topic: 'Home', kind: 'match', weight: 2, text: 'What living arrangement do you prefer at the start?',
      options: flexLast(opts('With my parents or in-laws', 'Our own home close to family', 'Our own home, independent', 'I am flexible')) },
    { id: 'fg6', topic: 'Home', kind: 'scale', weight: 1, text: 'How do you feel about owning a home?',
      options: flexLast(opts('A priority within a few years', 'A goal for the longer term', 'Renting is fine with me', 'No strong preference')) },
    { id: 'fg7', topic: 'Career', kind: 'scale', weight: 2, text: 'How do you see your career in the next five years?',
      options: opts('Career growth is my main focus', 'Balanced between career and family', 'Family first, career second', 'Family and home are my full focus') },
    { id: 'fg8', topic: 'Career', kind: 'scale', weight: 1, text: 'What about further education or training?',
      options: opts('I plan to study further', 'Maybe later', 'I am finished with formal study') },
    { id: 'fg9', topic: 'Dreams', kind: 'scale', weight: 1, text: 'How do you feel about Hajj and Umrah?',
      options: opts('Plan for Hajj as early as possible', 'Within the next ten years', 'When finances and health allow', 'Not something I plan for now') },
    { id: 'fg10', topic: 'Dreams', kind: 'match', weight: 2, text: 'Where do you see yourselves in ten years?',
      options: opts('A stable family life with a strong deen', 'A successful career or business, and a family', 'Serving the community and the ummah', 'Travelling and living abroad') },
  ],
};

export const QUIZZES: QuizDef[] = [MARRIAGE_VALUES, COMPATIBILITY, FUTURE_GOALS];

export const getQuiz = (id: string): QuizDef | undefined => QUIZZES.find((q) => q.id === id);

/** What the app needs to list a quiz (no questions). */
export const quizCard = (q: QuizDef) => ({
  id: q.id,
  title: q.title,
  subtitle: q.subtitle,
  description: q.description,
  icon: q.icon,
  minutes: q.minutes,
  questionCount: q.questions.length,
  topics: [...new Set(q.questions.map((x) => x.topic))],
});

/** The questions as the person answering sees them (no scoring details). */
export const quizForAnswering = (q: QuizDef) => ({
  ...quizCard(q),
  questions: q.questions.map((x) => ({ id: x.id, topic: x.topic, text: x.text, options: x.options.map((o) => ({ id: o.id, label: o.label })) })),
});
