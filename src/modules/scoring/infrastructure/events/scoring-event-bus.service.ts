import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { filter, Observable, Subject } from 'rxjs';
import {
  IScoringEventBus,
  ScoringJobEvent,
} from '../../application/interfaces/scoring-event.interface';

@Injectable()
export class ScoringEventBusService
  implements IScoringEventBus, OnModuleDestroy
{
  private readonly subject = new Subject<ScoringJobEvent>();

  publish(event: ScoringJobEvent): void {
    this.subject.next(event);
  }

  subscribeForUser(userId: string): Observable<ScoringJobEvent> {
    return this.subject
      .asObservable()
      .pipe(filter((event) => event.userId === userId));
  }

  onModuleDestroy(): void {
    this.subject.complete();
  }
}
