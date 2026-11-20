import { ScoringJobEvent } from '../../application/interfaces/scoring-event.interface';
import { ScoringEventBusService } from './scoring-event-bus.service';

describe('ScoringEventBusService', () => {
  let service: ScoringEventBusService;

  beforeEach(() => {
    service = new ScoringEventBusService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('delivers published events only to subscribers matching userId', () => {
    const user1Events: ScoringJobEvent[] = [];
    const user2Events: ScoringJobEvent[] = [];

    const sub1 = service
      .subscribeForUser('user-1')
      .subscribe((event) => user1Events.push(event));
    const sub2 = service
      .subscribeForUser('user-2')
      .subscribe((event) => user2Events.push(event));

    const eventForUser1: ScoringJobEvent = {
      userId: 'user-1',
      jobId: 'job-1',
      type: 'answer-scored',
      payload: {
        sessionId: 'session-1',
        overallScore: 8.5,
      },
    };
    const eventForUser2: ScoringJobEvent = {
      userId: 'user-2',
      jobId: 'job-2',
      type: 'answer-failed',
      payload: {
        sessionId: 'session-2',
        error: 'LLM evaluation failed',
      },
    };

    service.publish(eventForUser1);
    service.publish(eventForUser2);

    expect(user1Events).toEqual([eventForUser1]);
    expect(user2Events).toEqual([eventForUser2]);

    sub1.unsubscribe();
    sub2.unsubscribe();
  });

  it('completes all active streams on module destroy', () => {
    let completed = false;
    const emitted: ScoringJobEvent[] = [];

    service.subscribeForUser('user-1').subscribe({
      next: (event) => emitted.push(event),
      complete: () => {
        completed = true;
      },
    });

    service.onModuleDestroy();

    service.publish({
      userId: 'user-1',
      jobId: 'job-after-destroy',
      type: 'answer-scored',
      payload: {
        sessionId: 'session-3',
        overallScore: 7,
      },
    });

    expect(completed).toBe(true);
    expect(emitted).toEqual([]);
  });
});
