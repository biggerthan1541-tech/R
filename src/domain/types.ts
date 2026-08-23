export type Status = 'pass' | 'partial' | 'fail';
export type StatusOrUnknown = Status | 'unknown';

export type AnswerOption = { value: string; label: string };

export type AnswerSchema =
  | { type: 'enum'; options: AnswerOption[] }
  | { type: 'boolean' }
  | { type: 'percent' }
  | { type: 'number' };

export type Condition =
  | { op: 'always' }
  | { op: 'eq'; value: string | number | boolean }
  | { op: 'neq'; value: string | number | boolean }
  | { op: 'in'; value: (string | number | boolean)[] }
  | { op: 'not_in'; value: (string | number | boolean)[] }
  | { op: 'gte'; value: number }
  | { op: 'gt'; value: number }
  | { op: 'lte'; value: number }
  | { op: 'lt'; value: number };

export type Rule = { when: Condition; status: Status };

export type GapCopy = { consequence: string; fix: string };

export type ControlDefinition = {
  key: string;
  title: string;
  category: string;
  sortOrder: number;
  question: string;
  help?: string;
  answer: AnswerSchema;
  rules: Rule[];
  gap: Partial<Record<Status, GapCopy>>;
};

export type Control = ControlDefinition & { version: string };

export type Requirement = 'mandatory' | 'recommended' | 'optional';

export type ProfileItem = {
  control: string;
  weight: number;
  requirement: Requirement;
  note?: string;
};

export type ProfileDefinition = {
  key: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  items: ProfileItem[];
};
