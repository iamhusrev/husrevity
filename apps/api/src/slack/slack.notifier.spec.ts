import { Test, TestingModule } from '@nestjs/testing';
import { SlackNotifier } from './slack.notifier';
import { SlackApiService } from './slack-api.service';
import { SlackLink } from './slack-link.entity';

describe('SlackNotifier', () => {
  let notifier: SlackNotifier;
  let slackApi: jest.Mocked<SlackApiService>;

  beforeEach(async () => {
    slackApi = {
      postMessage: jest.fn(),
    } as unknown as jest.Mocked<SlackApiService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [SlackNotifier, { provide: SlackApiService, useValue: slackApi }],
    }).compile();

    notifier = module.get<SlackNotifier>(SlackNotifier);
  });

  it('should be defined', () => {
    expect(notifier).toBeDefined();
  });

  it('sends notification text when target is linked and has slackUserId', async () => {
    slackApi.postMessage.mockResolvedValue({ ok: true, ts: '12345.67' });
    const link = { slackUserId: 'U12345678', status: 'linked' } as SlackLink;
    const payload = {
      id: 'notif-1',
      title: 'Task Reminder',
      body: 'Do something',
      deepLink: '/tasks/1',
      kind: 'reminder',
    };

    await notifier.send(link, payload);

    expect(slackApi.postMessage).toHaveBeenCalledWith('U12345678', 'Task Reminder\nDo something');
  });

  it('formats payload with title only when body is empty', async () => {
    slackApi.postMessage.mockResolvedValue({ ok: true, ts: '12345.68' });
    const link = { slackUserId: 'U12345678', status: 'linked' } as SlackLink;
    const payload = {
      id: 'notif-2',
      title: 'Quick Alert',
      body: '',
      deepLink: '/dashboard',
      kind: 'alert',
    };

    await notifier.send(link, payload);

    expect(slackApi.postMessage).toHaveBeenCalledWith('U12345678', 'Quick Alert');
  });

  it('skips send if link has no slackUserId or status is not linked', async () => {
    const linkUnlinked = { slackUserId: 'U12345', status: 'unlinked' } as SlackLink;
    const linkNoUser = { slackUserId: null, status: 'linked' } as unknown as SlackLink;
    const payload = {
      id: 'notif-3',
      title: 'Alert',
      body: 'Body',
      deepLink: '/',
      kind: 'alert',
    };

    await notifier.send(linkUnlinked, payload);
    await notifier.send(linkNoUser, payload);

    expect(slackApi.postMessage).not.toHaveBeenCalled();
  });

  it('throws error when postMessage returns null', async () => {
    slackApi.postMessage.mockResolvedValue(null);
    const link = { slackUserId: 'U12345678', status: 'linked' } as SlackLink;
    const payload = {
      id: 'notif-4',
      title: 'Title',
      body: 'Body',
      deepLink: '/',
      kind: 'alert',
    };

    await expect(notifier.send(link, payload)).rejects.toThrow(
      'Slack postMessage failed for slackUserId U12345678',
    );
  });
});
