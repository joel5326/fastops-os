import { randomUUID } from 'crypto';
import type { EventBus } from '../core/event-bus.js';
import type { InMemoryCommsBus } from '../comms/bus.js';

export type AgentQuestionStatus = 'pending' | 'answered';

export interface AgentQuestion {
  id: string;
  from: string;
  to: string;
  question: string;
  context?: string;
  status: AgentQuestionStatus;
  askedAt: string;
  answeredAt?: string;
  answer?: string;
  answeredBy?: string;
}

export interface AskQuestionInput {
  from: string;
  to: string;
  question: string;
  context?: string;
}

export interface AnswerQuestionInput {
  questionId: string;
  answer: string;
  answeredBy: string;
}

export class AgentQuestionBus {
  private readonly questions = new Map<string, AgentQuestion>();

  constructor(
    private readonly events: EventBus,
    private readonly comms: InMemoryCommsBus,
  ) {}

  ask(input: AskQuestionInput): AgentQuestion {
    const askedAt = new Date().toISOString();
    const item: AgentQuestion = {
      id: randomUUID(),
      from: input.from,
      to: input.to,
      question: input.question,
      context: input.context,
      status: 'pending',
      askedAt,
    };

    this.questions.set(item.id, item);
    this.events.emit('agent.question.asked', {
      id: item.id,
      from: item.from,
      to: item.to,
    });
    this.comms.send({
      from: item.from,
      channel: 'general',
      content: `[Q:${item.id}] ${item.from} -> ${item.to}: ${item.question}`,
    });

    return item;
  }

  answer(input: AnswerQuestionInput): AgentQuestion {
    const existing = this.questions.get(input.questionId);
    if (!existing) {
      throw new Error(`Question not found: ${input.questionId}`);
    }
    if (existing.status === 'answered') {
      throw new Error(`Question already answered: ${input.questionId}`);
    }

    existing.status = 'answered';
    existing.answer = input.answer;
    existing.answeredBy = input.answeredBy;
    existing.answeredAt = new Date().toISOString();

    this.events.emit('agent.question.answered', {
      id: existing.id,
      from: existing.from,
      to: existing.to,
      answeredBy: existing.answeredBy,
    });
    this.comms.send({
      from: existing.answeredBy,
      channel: 'general',
      content: `[A:${existing.id}] ${existing.answeredBy} answered ${existing.from}`,
    });

    return existing;
  }

  getById(id: string): AgentQuestion | undefined {
    return this.questions.get(id);
  }

  getInbox(agentId: string, status?: AgentQuestionStatus): AgentQuestion[] {
    return this.list()
      .filter((q) => q.to === agentId && (!status || q.status === status));
  }

  getOutbox(agentId: string, status?: AgentQuestionStatus): AgentQuestion[] {
    return this.list()
      .filter((q) => q.from === agentId && (!status || q.status === status));
  }

  list(): AgentQuestion[] {
    return Array.from(this.questions.values())
      .sort((a, b) => a.askedAt.localeCompare(b.askedAt));
  }
}
