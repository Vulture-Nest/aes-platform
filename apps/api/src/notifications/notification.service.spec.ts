import { NotificationChannel, NotificationSeverity } from '@prisma/client';
import { NotificationService } from './notification.service';
import { NotificationTransport } from './transports/notification-transport';

/** Build a mock transport that records its sends. */
function mockTransport(channel: string, enabled = true): jest.Mocked<NotificationTransport> {
  return {
    channel,
    isEnabled: jest.fn().mockReturnValue(enabled),
    send: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<NotificationTransport>;
}

describe('NotificationService — transport dispatch (G7)', () => {
  const prisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };

  let email: jest.Mocked<NotificationTransport>;
  let push: jest.Mocked<NotificationTransport>;
  let teams: jest.Mocked<NotificationTransport>;
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    email = mockTransport('EMAIL');
    push = mockTransport('PUSH');
    teams = mockTransport('TEAMS');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new NotificationService(prisma as any, email as any, push as any, teams as any);

    // Persist returns a notification echoing the passed data.
    prisma.notification.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'n1', ...data }),
    );
    prisma.user.findUnique.mockResolvedValue({ email: 'user@aes.local' });
    // Default: no preference row → channel enabled.
    prisma.notificationPreference.findUnique.mockResolvedValue(null);
  });

  it('persists in-app and dispatches WATCH to email + push (not Teams)', async () => {
    await service.send({
      userIds: ['u1'],
      template: 'approval.pending',
      severity: NotificationSeverity.WATCH,
    });

    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(teams.send).not.toHaveBeenCalled();

    const [notification, recipient] = email.send.mock.calls[0];
    expect(recipient).toEqual({ userId: 'u1', email: 'user@aes.local', deviceTokens: [] });
    expect(notification).toMatchObject({ template: 'approval.pending' });
  });

  it('dispatches DANGER to email + push + Teams', async () => {
    await service.send({
      userIds: ['u1'],
      template: 'danger.threshold',
      severity: NotificationSeverity.DANGER,
    });

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(teams.send).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch external channels for INFO (in-app only)', async () => {
    await service.send({
      userIds: ['u1'],
      template: 'info.notice',
      severity: NotificationSeverity.INFO,
    });

    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(email.send).not.toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
    expect(teams.send).not.toHaveBeenCalled();
  });

  it('skips a channel disabled by the user preference', async () => {
    prisma.notificationPreference.findUnique.mockImplementation(
      ({ where }: { where: { userId_channel: { channel: NotificationChannel } } }) =>
        Promise.resolve(
          where.userId_channel.channel === NotificationChannel.EMAIL ? { enabled: false } : null,
        ),
    );

    await service.send({
      userIds: ['u1'],
      template: 'approval.pending',
      severity: NotificationSeverity.WATCH,
    });

    expect(email.send).not.toHaveBeenCalled();
    expect(push.send).toHaveBeenCalledTimes(1);
  });

  it('does not throw when a transport is unconfigured and no-ops', async () => {
    // Unconfigured transport = enabled false, send() resolves without side effects.
    push.isEnabled.mockReturnValue(false);
    push.send.mockResolvedValue(undefined);

    await expect(
      service.send({
        userIds: ['u1'],
        template: 'approval.pending',
        severity: NotificationSeverity.WATCH,
      }),
    ).resolves.toHaveLength(1);

    // Service still calls send(); the transport itself is responsible for the no-op.
    expect(push.send).toHaveBeenCalledTimes(1);
  });

  it('fans out across multiple users and dispatches per user', async () => {
    await service.send({
      userIds: ['u1', 'u2'],
      template: 'approval.pending',
      severity: NotificationSeverity.WATCH,
    });

    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(email.send).toHaveBeenCalledTimes(2);
    expect(push.send).toHaveBeenCalledTimes(2);
  });
});
