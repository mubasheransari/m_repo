import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ChatService } from '../chat/chat.service';
import { REASON_TEXT, sortedPair } from '../chat/chat.rules';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicView } from '../profile/public-view';
import { getQuiz, QUIZZES, quizCard, quizForAnswering } from './quiz.catalog';
import { Answers, cleanAnswers, compare, Comparison, levelOf, verdict } from './quiz.scoring';
import { effectiveStatus, quizSummary } from './quiz.view';

/** A quiz invitation stays open this long. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Anti-spam: invitations one member may send per 24 hours. */
export const DAILY_QUIZ_INVITES = 10;

const CARD = { profile: true, privacy: true, media: { orderBy: { position: 'asc' as const } } };

@Injectable()
export class QuizService {
  constructor(private prisma: PrismaService, private chat: ChatService) {}

  // ---------------------------------------------------------------- catalogue
  catalog() {
    return QUIZZES.map(quizCard);
  }

  definition(quizId: string) {
    const quiz = getQuiz(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');
    return quizForAnswering(quiz);
  }

  // ------------------------------------------------------------------ helpers
  private async blockedWith(userId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return (rows as any[]).map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId));
  }

  /** Name + the photo other members may see. Never anything else. */
  private brief(user: any) {
    const v = toPublicView(user, null, null);
    const photo = v.media.find((m: any) => m.type === 'PHOTO');
    return { id: v.id as string, firstName: v.firstName as string, verified: !!v.verified, photo: photo ? { url: photo.url as string } : null };
  }

  /**
   * The conversation a quiz is sent in. Quizzes go to people you have matched with or are already chatting with
   * (an accepted conversation), never to strangers.
   */
  private async conversationFor(userId: string, otherId: string): Promise<string> {
    const el = await this.chat.eligibility(userId, otherId);
    if (!el.allowed) throw new ForbiddenException(REASON_TEXT[el.reason] ?? 'You cannot send a quiz to this member');

    const [a, b] = sortedPair(userId, otherId);
    const conv = await this.prisma.conversation.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });
    if (conv && conv.status === 'ACCEPTED') return conv.id;
    if (conv && conv.status !== 'CLOSED') throw new ForbiddenException('You can send a quiz once your chat request has been accepted');

    const match = await this.prisma.match.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });
    if (!match) throw new ForbiddenException('You can send a quiz to people you have matched with or are chatting with');

    if (conv) {
      // Previously blocked and since unblocked: same clean slate as sending a first message.
      await this.prisma.message.deleteMany({ where: { conversationId: conv.id } });
      await this.prisma.conversation.update({ where: { id: conv.id }, data: { initiatorId: userId, origin: 'MATCH', status: 'ACCEPTED', respondedAt: null } });
      return conv.id;
    }
    try {
      const created = await this.prisma.conversation.create({ data: { userAId: a, userBId: b, initiatorId: userId, origin: 'MATCH', status: 'ACCEPTED' } });
      return created.id;
    } catch {
      const again = await this.prisma.conversation.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } }); // lost a race, reuse
      if (!again) throw new NotFoundException('Conversation not found');
      return again.id;
    }
  }

  private async load(userId: string, id: string) {
    const inv: any = await this.prisma.quizInvite.findUnique({ where: { id }, include: { sender: { include: CARD }, recipient: { include: CARD } } });
    if (!inv || (inv.senderId !== userId && inv.recipientId !== userId)) throw new NotFoundException('Quiz not found'); // only the two members can see it
    const otherId = inv.senderId === userId ? inv.recipientId : inv.senderId;
    const other = inv.senderId === userId ? inv.recipient : inv.sender;
    if (other.status !== 'ACTIVE' || !other.profile || (await this.blockedWith(userId)).includes(otherId)) throw new NotFoundException('Quiz not found');
    return { inv, other };
  }

  // -------------------------------------------------------------------- send
  async send(userId: string, toUserId: string, quizId: string, rawAnswers: unknown) {
    const quiz = getQuiz(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (userId === toUserId) throw new BadRequestException('You cannot send a quiz to yourself');
    const answers = cleanAnswers(quiz, rawAnswers);
    const conversationId = await this.conversationFor(userId, toUserId);

    const now = new Date();
    const open = { status: 'PENDING' as const, expiresAt: { gt: now } };
    const [alreadySent, alreadyReceived, sentToday] = await Promise.all([
      this.prisma.quizInvite.count({ where: { senderId: userId, recipientId: toUserId, quizId, ...open } }),
      this.prisma.quizInvite.count({ where: { senderId: toUserId, recipientId: userId, quizId, ...open } }),
      this.prisma.quizInvite.count({ where: { senderId: userId, createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
    ]);
    if (alreadySent > 0) throw new ConflictException(`You already sent them the "${quiz.title}" quiz. Wait for their answers, or cancel it first.`);
    if (alreadyReceived > 0) throw new ConflictException(`They already sent you the "${quiz.title}" quiz. Answer theirs instead.`);
    if (sentToday >= DAILY_QUIZ_INVITES) throw new HttpException('You have reached the daily limit of quizzes. Try again tomorrow.', HttpStatus.TOO_MANY_REQUESTS);

    const id = randomUUID();
    const [invite] = await this.prisma.$transaction([
      this.prisma.quizInvite.create({
        data: { id, quizId, quizVersion: quiz.version, conversationId, senderId: userId, recipientId: toUserId, senderAnswers: answers, expiresAt: new Date(now.getTime() + INVITE_TTL_MS) },
      }),
      this.prisma.message.create({ data: { conversationId, senderId: userId, body: `📝 Compatibility quiz: ${quiz.title}`, kind: 'QUIZ_SENT', quizInviteId: id } }),
      this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
    ]);
    return { conversationId, invite: quizSummary(invite, userId) };
  }

  // ------------------------------------------------------------------ reading
  /** My quizzes (sent and received), newest first. `withUserId` narrows it to one person. */
  async list(userId: string, withUserId?: string) {
    const blocked = await this.blockedWith(userId);
    const rows: any[] = await this.prisma.quizInvite.findMany({
      where: withUserId
        ? { OR: [{ senderId: userId, recipientId: withUserId }, { senderId: withUserId, recipientId: userId }] }
        : { OR: [{ senderId: userId }, { recipientId: userId }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { sender: { include: CARD }, recipient: { include: CARD } },
    });
    return rows
      .map((inv) => ({ inv, other: inv.senderId === userId ? inv.recipient : inv.sender }))
      .filter(({ other }) => other.status === 'ACTIVE' && other.profile && !blocked.includes(other.id))
      .map(({ inv, other }) => ({ ...quizSummary(inv, userId), conversationId: inv.conversationId, other: this.brief(other) }));
  }

  async get(userId: string, id: string) {
    const { inv, other } = await this.load(userId, id);
    const quiz = getQuiz(inv.quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');
    const status = effectiveStatus(inv);
    const iAmSender = inv.senderId === userId;
    const out: Record<string, unknown> = { ...quizSummary(inv, userId), conversationId: inv.conversationId, other: this.brief(other) };

    // The person being asked sees the questions, never the sender's answers.
    if (status === 'PENDING' && !iAmSender) out.quiz = quizForAnswering(quiz);

    if (status === 'COMPLETED') {
      const mine = (iAmSender ? inv.senderAnswers : inv.recipientAnswers) as Answers;
      const theirs = (iAmSender ? inv.recipientAnswers : inv.senderAnswers) as Answers;
      const cmp = inv.breakdown as Comparison;
      const label = (qid: string, optId: string) => quiz.questions.find((q) => q.id === qid)?.options.find((o) => o.id === optId)?.label ?? '';
      out.result = {
        score: inv.score,
        verdict: verdict(inv.score ?? 0),
        completedAt: inv.completedAt,
        topics: cmp.topics,
        items: quiz.questions.map((q) => {
          const sim = cmp.items.find((i) => i.questionId === q.id)?.similarity ?? 0;
          return { id: q.id, topic: q.topic, text: q.text, important: !!q.important, mine: label(q.id, mine[q.id]), theirs: label(q.id, theirs[q.id]), similarity: sim, level: levelOf(sim) };
        }),
      };
    }
    return out;
  }

  // ---------------------------------------------------------------- responding
  async answer(userId: string, id: string, rawAnswers: unknown) {
    const { inv } = await this.load(userId, id);
    if (inv.recipientId !== userId) throw new ForbiddenException('Only the person who received the quiz can answer it');
    const quiz = getQuiz(inv.quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');
    const status = effectiveStatus(inv);
    if (status === 'COMPLETED') throw new ConflictException('You have already answered this quiz');
    if (status !== 'PENDING') throw new BadRequestException(status === 'EXPIRED' ? 'This quiz has expired' : 'This quiz is no longer available');

    const answers = cleanAnswers(quiz, rawAnswers);
    const cmp = compare(quiz, inv.senderAnswers as Answers, answers);
    const now = new Date();
    const done = await this.prisma.quizInvite.updateMany({
      where: { id, recipientId: userId, status: 'PENDING' },
      data: { status: 'COMPLETED', recipientAnswers: answers, score: cmp.score, breakdown: cmp as any, completedAt: now },
    });
    if (done.count !== 1) throw new ConflictException('This quiz was already answered');

    await this.prisma.$transaction([
      this.prisma.message.create({ data: { conversationId: inv.conversationId, senderId: userId, body: `📝 Quiz completed: ${quiz.title} - ${cmp.score}% compatible`, kind: 'QUIZ_DONE', quizInviteId: id } }),
      this.prisma.conversation.update({ where: { id: inv.conversationId }, data: { lastMessageAt: now } }),
    ]);
    return this.get(userId, id);
  }

  /** The recipient says no thanks. */
  async decline(userId: string, id: string) {
    return this.close(userId, id, 'recipient', 'DECLINED', 'QUIZ_DECLINED', 'Quiz declined');
  }

  /** The sender takes the invitation back. */
  async cancel(userId: string, id: string) {
    return this.close(userId, id, 'sender', 'CANCELLED', 'QUIZ_CANCELLED', 'Quiz cancelled');
  }

  private async close(userId: string, id: string, who: 'sender' | 'recipient', status: 'DECLINED' | 'CANCELLED', kind: string, text: string) {
    const { inv } = await this.load(userId, id);
    if ((who === 'sender' ? inv.senderId : inv.recipientId) !== userId) throw new ForbiddenException(who === 'sender' ? 'Only the sender can cancel a quiz' : 'Only the person who received the quiz can decline it');
    if (effectiveStatus(inv) !== 'PENDING') throw new BadRequestException('This quiz is no longer waiting for an answer');
    const quiz = getQuiz(inv.quizId);
    const done = await this.prisma.quizInvite.updateMany({ where: { id, status: 'PENDING' }, data: { status } });
    if (done.count !== 1) throw new ConflictException('This quiz was already answered');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.message.create({ data: { conversationId: inv.conversationId, senderId: userId, body: `📝 ${text}: ${quiz?.title ?? 'Compatibility quiz'}`, kind, quizInviteId: id } }),
      this.prisma.conversation.update({ where: { id: inv.conversationId }, data: { lastMessageAt: now } }),
    ]);
    return this.get(userId, id);
  }
}
