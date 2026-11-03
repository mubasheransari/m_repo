import { getQuiz } from './quiz.catalog';

/** A pending invite past its expiry is treated as expired everywhere, with no scheduled job needed. */
export const effectiveStatus = (inv: { status: string; expiresAt: Date | string }): string =>
  inv.status === 'PENDING' && new Date(inv.expiresAt).getTime() < Date.now() ? 'EXPIRED' : inv.status;

/** The small card the chat and the quiz list show. Never contains anyone's answers. */
export function quizSummary(inv: any, viewerId: string) {
  const quiz = getQuiz(inv.quizId);
  const status = effectiveStatus(inv);
  return {
    inviteId: inv.id as string,
    quizId: inv.quizId as string,
    title: quiz?.title ?? 'Compatibility quiz',
    icon: quiz?.icon ?? 'heart',
    questionCount: quiz?.questions.length ?? 0,
    status,
    iAmSender: inv.senderId === viewerId,
    score: status === 'COMPLETED' ? (inv.score as number | null) : null,
    createdAt: inv.createdAt,
    expiresAt: inv.expiresAt,
  };
}
