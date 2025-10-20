export type ISODateString = string;

export type QASpecStatus =
  | 'pending_clarification'
  | 'clarification_complete'
  | 'yaml_generated'
  | 'features_generated';

export interface QASpecification {
  id: string;
  filename: string;
  content: string;
  createdAt: ISODateString;
  author: string;
  status: QASpecStatus;
}

export interface QASpecSummary {
  id: string;
  filename: string;
  status: QASpecStatus;
  updatedAt: ISODateString;
}
