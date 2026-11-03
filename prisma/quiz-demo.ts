/**
 * Test the quiz feature with one phone.
 *
 *   npx tsx prisma/quiz-demo.ts you@example.com                  -> a demo member sends YOU the "Marriage & Values" quiz
 *   npx tsx prisma/quiz-demo.ts you@example.com future-goals     -> same, with another quiz
 *
 * It picks a demo member of the opposite gender, makes you matched with them (with an open chat), and sends you a
 * quiz they have already answered. Open Messages in the app, take the quiz, and you will see your score.
 * Quiz ids: marriage-values, compatibility-lifestyle, future-goals
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { getQuiz } from '../src/quiz/quiz.catalog';

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const quizId = process.argv[3] || 'marriage-values';
  if (!email) throw new Error('Usage: npx tsx prisma/quiz-demo.ts you@example.com [quiz-id]');
  const quiz = getQuiz(quizId);
  if (!quiz) throw new Error(`Unknown quiz "${quizId}". Use marriage-values, compatibility-lifestyle or future-goals.`);

  const me = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
  if (!me?.profile) throw new Error(`No member with a profile found for ${email}. Sign up in the app and finish your profile first.`);

  const demo = await prisma.user.findFirst({
    where: { email: { startsWith: 'seed.' }, status: 'ACTIVE', profile: { is: { gender: me.profile.gender === 'MALE' ? 'FEMALE' : 'MALE', onboardingComplete: true } } },
    include: { profile: true },
    orderBy: { email: 'asc' },
  });
  if (!demo?.profile) throw new Error('No demo members found. Run: npm run seed');

  const [a, b] = [me.id, demo.id].sort();
  await prisma.match.upsert({ where: { userAId_userBId: { userAId: a, userBId: b } }, create: { userAId: a, userBId: b }, update: {} });
  const conv = await prisma.conversation.upsert({
    where: { userAId_userBId: { userAId: a, userBId: b } },
    create: { userAId: a, userBId: b, initiatorId: demo.id, origin: 'MATCH', status: 'ACCEPTED' },
    update: { status: 'ACCEPTED' },
  });

  // The demo member's answers: a steady mix, so you get a realistic middle-of-the-road score.
  const answers: Record<string, string> = {};
  quiz.questions.forEach((q, i) => {
    const real = q.options.filter((o) => !o.flex);
    answers[q.id] = real[(i * 2 + 1) % real.length].id;
  });

  const open = await prisma.quizInvite.findFirst({ where: { senderId: demo.id, recipientId: me.id, quizId, status: 'PENDING', expiresAt: { gt: new Date() } } });
  if (open) {
    console.log(`${demo.profile.firstName} already sent you "${quiz.title}" and it is waiting. Open Messages in the app.`);
    return;
  }

  const id = randomUUID();
  await prisma.$transaction([
    prisma.quizInvite.create({ data: { id, quizId, quizVersion: quiz.version, conversationId: conv.id, senderId: demo.id, recipientId: me.id, senderAnswers: answers, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) } }),
    prisma.message.create({ data: { conversationId: conv.id, senderId: demo.id, body: `📝 Compatibility quiz: ${quiz.title}`, kind: 'QUIZ_SENT', quizInviteId: id } }),
    prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } }),
  ]);
  console.log(`${demo.profile.firstName} sent you the "${quiz.title}" quiz. Open Messages in the app, open the chat with ${demo.profile.firstName} and tap "Take the quiz".`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
