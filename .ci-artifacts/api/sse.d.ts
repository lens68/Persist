import type { RuntimeChunk } from '@persist/shared';
import type { ServerResponse } from 'node:http';
/**
 * Transport adapter: RuntimeChunk stream → SSE.
 * Integration layer only — not part of runtime core.
 */
export declare function writeRuntimeChunkSse(res: ServerResponse, stream: AsyncIterable<RuntimeChunk>): Promise<void>;
//# sourceMappingURL=sse.d.ts.map