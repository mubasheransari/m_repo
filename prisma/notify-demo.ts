/**
 * Try notifications with ONE phone.
 *
 *   npx tsx prisma/notify-demo.ts you@example.com            -> a demo member visits your profile, likes you and sends a direct message
 *   npx tsx prisma/notify-demo.ts you@example.com visit      -> only: visits your profile (run it again: the count goes up)
 *   npx tsx prisma/notify-demo.ts you@example.com like|direct|message
 *
 * Keep the app open: the notification appears on the phone within a few seconds and shows in the Notifications list.
 * Needs demo members: npm run seed
 */
import { PrismaClient } from '@prisma/client';
import { NotificationsService } from '../src/notifications/notifications.service';
import { sortedPair } from '../src/chat/chat.rules';

const prisma = new PrismaClient();
const notifications = new NotificationsService(prisma as any);

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const what = (process.argv[3] || 'all').toLowerCase();
  if (!email) throw new Error('Usage: npx tsx prisma/notify-demo.ts you@example.com [visit|like|direct|message]');

  const me = await prisma.user.findUnique({ where: { email }, include: { profile: true } });
  if (!me?.profile) throw new Error(`No member with a profile found for ${email}. Sign up in the app and finish your profile first.`);
  const demo = await prisma.user.findFirst({
    where: { email: { startsWith: 'seed.' }, status: 'ACTIVE', profile: { is: { gender: me.profile.gender === 'MALE' ? 'FEMALE' : 'MALE', onboardingComplete: true } } },
    include: { profile: true },
    orderBy: { email: 'asc' },
  });
  if (!demo?.profile) throw new Error('No demo members found. Run: npm run seed');
  const name = demo.profile.firstName;
  const [a, b] = sortedPair(me.id, demo.id);

  if (what === 'all' || what === 'visit') {
    await prisma.profileVisit.create({ data: { viewerId: demo.id, profileId: me.id } });
    const total = await prisma.profileVisit.count({ where: { viewerId: demo.id, profileId: me.id } });
    await notifications.profileVisited(me.id, demo.id, total);
    console.log(`${name} visited your profile (${total} time${total === 1 ? '' : 's'} in all).`);
  }
  if (what === 'all' || what === 'like') {
    await prisma.swipe.upsert({ where: { fromId_toId: { fromId: demo.id, toId: me.id } }, create: { fromId: demo.id, toId: me.id, action: 'LIKE' }, update: { action: 'LIKE' } });
    await notifications.likeReceived(me.id, demo.id);
    console.log(`${name} liked you.`);
  }
  if (what === 'all' || what === 'direct' || what === 'message') {
    const direct = what !== 'message';
    const conv = await prisma.conversation.upsert({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      create: { userAId: a, userBId: b, initiatorId: demo.id, origin: direct ? 'DIRECT' : 'MATCH', status: direct ? 'PENDING' : 'ACCEPTED' },
      update: {},
    });
    const body = direct ? 'Assalamu alaikum! I read your profile and would love to say hello.' : 'How is your day going?';
    await prisma.message.create({ data: { conversationId: conv.id, senderId: demo.id, body } });
    await prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } });
    await notifications.messageReceived({
      toId: me.id, fromId: demo.id, conversationId: conv.id, body,
      kind: conv.status === 'PENDING' ? (conv.origin === 'DIRECT' ? 'DIRECT' : 'REQUEST') : 'MESSAGE',
    });
    console.log(`${name} sent you a ${conv.status === 'PENDING' ? 'message request' : 'message'}.`);
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
