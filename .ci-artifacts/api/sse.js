/**
 * Transport adapter: RuntimeChunk stream → SSE.
 * Integration layer only — not part of runtime core.
 */
export async function writeRuntimeChunkSse(res, stream) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    try {
        for await (const chunk of stream) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        res.write('data: [DONE]\n\n');
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Stream error';
        res.write(`data: ${JSON.stringify({
            type: 'error',
            code: 'stream_error',
            message,
            timestamp: new Date().toISOString(),
        })}\n\n`);
    }
    finally {
        res.end();
    }
}
//# sourceMappingURL=sse.js.map