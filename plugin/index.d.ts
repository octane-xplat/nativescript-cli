export type Phase = 'collect' | 'prepared' | 'post_build';
export interface Manifest { id: string; version: string; api: '1'; phases: Phase[]; after?: string[]; platforms?: ('ios'|'android')[]; required?: string[] }
export interface Input { phase: Phase; project: string; platform: string; configuration: string; revision: string; pins: {name:string;version:string}[] }
export interface Result { files?: {path:string;content:string}[]; diagnostics?: string[] }
export function defineExtension(manifest: Manifest, invoke: (input: Input, options: {signal: AbortSignal}) => Promise<Result> | Result): Readonly<{manifest: Manifest; invoke: typeof invoke}>;
