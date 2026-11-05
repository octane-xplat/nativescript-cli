export type Phase = 'collect' | 'prepared' | 'post_build';
export interface Manifest { id: string; version: string; api: '1'; phases: Phase[]; after?: string[]; platforms?: ('ios'|'android')[]; required?: string[] }
export interface Artifact { path: string; kind: string; applicationId: string }
export interface Input { phase: Phase; project: string; platform: string; configuration: string; revision: string; pins: {name:string;version:string}[]; artifacts: Artifact[] }
export interface NativeFile { platform: 'ios'|'android'; kind: 'source'|'resource'|'configuration'|'library'|'framework'; path: string; content: Uint8Array }
export interface Result { files?: {path:string;content:string}[]; nativeFiles?: NativeFile[]; diagnostics?: string[] }
export function defineExtension(manifest: Manifest, invoke: (input: Input, options: {signal: AbortSignal}) => Promise<Result> | Result): Readonly<{manifest: Manifest; invoke: typeof invoke}>;
