import type { FastifyInstance } from 'fastify';
import type { ChatProvider } from '@persist/shared';
import type { SessionStore } from '@persist/shared';
export interface ApiDeps {
    store: SessionStore;
    provider: ChatProvider;
}
export declare function registerRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void>;
//# sourceMappingURL=routes.d.ts.map