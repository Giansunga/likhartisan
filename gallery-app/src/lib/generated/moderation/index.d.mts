export function censorText<T extends string | null | undefined>(text: T): T extends string ? string : T;
export function censorMessageRecord<T>(table: string, value: T): T;
export function censorMessageBody<T extends string | null | undefined>(text: T): T;
export function censorMessagePayload<T>(value: T): T;
export function censorRpc<T>(name: string, value: T): T;
export const moderatedTables: string[];
