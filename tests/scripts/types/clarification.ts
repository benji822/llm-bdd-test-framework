import type { ISODateString } from './qa-specification';

export interface ClarificationQuestion {
  id: number;
  text: string;
  answer: string | null;
  required: boolean;
}

export interface ClarificationDocument {
  specId: string;
  questions: ClarificationQuestion[];
  answeredAt: ISODateString | null;
  answeredBy: string | null;
}

export interface ClarificationStatus {
  specId: string;
  pendingRequiredQuestions: number;
  lastUpdated: ISODateString;
}
